"""Build province and ward boundaries from COD-AB and mapped OSM relations.

Usage: python scripts/build_boundaries.py cod-vnm.zip osm-2025.json
Requires Shapely 2.1. The inputs and scripts/ward_relations.csv are read-only.
"""
from __future__ import annotations

import argparse
import csv
import json
import zipfile
from pathlib import Path

from shapely import coverage_is_valid, coverage_simplify, make_valid
from shapely.geometry import LineString, MultiPolygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import polygonize_full, unary_union

DATA = Path(__file__).resolve().parents[1] / "public" / "data"
PROVINCE_CODES = set("01 04 08 11 12 14 15 19 20 22 24 25 31 33 37 38 40 42 44 46 48 51 52 56 66 68 75 79 80 82 86 91 92 96".split())
DEFAULT_WARD_RELATIONS = Path(__file__).with_name("ward_relations.csv")


def write(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry] if not geometry.is_empty else []
    if hasattr(geometry, "geoms"):
        return [part for component in geometry.geoms for part in polygons(component)]
    return []


def feature(geo_id, geometry):
    parts = [orient(part, sign=1.0) for part in polygons(geometry)]
    if not parts or not geometry.is_valid:
        raise ValueError(f"Invalid geometry for {geo_id}")
    result = parts[0] if len(parts) == 1 else MultiPolygon(parts)
    return {"type": "Feature", "properties": {"geoId": geo_id}, "geometry": mapping(result)}


def collection(features):
    return {"type": "FeatureCollection", "features": features}


def read_provinces(zip_path):
    with zipfile.ZipFile(zip_path) as archive, archive.open("vnm_admin1.geojson") as source:
        rows = json.load(source)["features"]
    if len(rows) != 34 or {row["properties"]["adm1_pcode"] for row in rows} != {"VN" + code for code in PROVINCE_CODES}:
        raise ValueError("COD-AB province coverage does not match the administrative list")
    rows.sort(key=lambda row: row["properties"]["adm1_pcode"])
    geometries = [shape(row["geometry"]) for row in rows]
    if not coverage_is_valid(geometries):
        raise ValueError("Unexpected overlap or unmatched provincial boundaries in source")
    simplified = coverage_simplify(geometries, 0.0013)
    if not coverage_is_valid(simplified):
        raise ValueError("Simplified province edges are not a valid coverage")
    features = []
    units = []
    for row, original, reduced in zip(rows, geometries, simplified, strict=True):
        prop = row["properties"]
        if (prop["version"], prop["valid_on"]) != ("v02", "2025-09-25"):
            raise ValueError("Unexpected source version or date")
        code = prop["adm1_pcode"][2:]
        # Repair the invalid An Giang geometry without discarding polygon parts.
        fixed = reduced if reduced.is_valid else make_valid(reduced, method="structure", keep_collapsed=False)
        if len(polygons(fixed)) < len(polygons(original)):
            raise ValueError(f"Province {code} lost polygon components")
        name = prop["adm1_name1"]
        if name.startswith(prop["adm1_type_vi"] + " "):
            full_name = name
        else:
            full_name = f'{prop["adm1_type_vi"]} {name}'
        units.append({"id": "P" + code, "level": "province", "code": code, "name": full_name, "parentId": "VN", "aliases": []})
        features.append(feature("P" + code, fixed))
    if not coverage_is_valid([shape(item["geometry"]) for item in features]):
        raise ValueError("Repaired provinces do not form a valid coverage")
    return units, features


def ward_polygons(members, role):
    lines = [
        LineString([(point["lon"], point["lat"]) for point in member["geometry"]])
        for member in members if member["type"] == "way" and member["role"] == role
    ]
    if not lines:
        return []
    outlines, cuts, dangles, invalid = polygonize_full(lines)
    if any(not residue.is_empty for residue in (cuts, dangles, invalid)):
        raise ValueError(f"Incomplete {role} boundary")
    return list(outlines.geoms)


def read_ward_relation_mapping(path, units):
    by_id = {row["id"]: row for row in units}
    relations = {}
    geo_ids = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"relationId", "geoId"} <= set(reader.fieldnames or []):
            raise ValueError(f"{path}: cần các cột relationId,geoId")
        for line, row in enumerate(reader, start=2):
            try:
                relation_value = row.get("relationId") or ""
                relation_id = int(relation_value.strip())
            except (TypeError, ValueError):
                raise ValueError(f"{path}:{line}: relationId phải là số nguyên") from None
            geo_id = (row.get("geoId") or "").strip()
            unit = by_id.get(geo_id)
            if relation_id <= 0 or not unit or unit["level"] != "ward":
                raise ValueError(f"{path}:{line}: quan hệ hoặc geoId phường không hợp lệ")
            if relation_id in relations or geo_id in geo_ids:
                raise ValueError(f"{path}:{line}: relationId hoặc geoId bị trùng")
            relations[relation_id] = geo_id
            geo_ids.add(geo_id)
    if not relations:
        raise ValueError(f"{path}: cần ít nhất một quan hệ OSM")
    return relations


def read_wards(path, relations, units, provinces):
    osm = json.loads(path.read_text(encoding="utf-8"))
    if {row["id"] for row in osm["elements"]} != relations.keys():
        raise ValueError("OSM response must contain exactly the mapped ward relations")
    province_shapes = {row["properties"]["geoId"]: shape(row["geometry"]) for row in provinces}
    results = {}
    for row in osm["elements"]:
        geo_id = relations[row["id"]]
        unit = units[geo_id]
        if unit["parentId"] not in province_shapes:
            raise ValueError(f"Unknown parent province for {geo_id}")
        tags = row["tags"]
        if tags["boundary"] != "administrative" or tags["name"] != unit["name"]:
            raise ValueError(f"Ward identity mismatch for {geo_id}")
        outer = unary_union(ward_polygons(row["members"], "outer"))
        inner = unary_union(ward_polygons(row["members"], "inner"))
        result = outer.difference(inner)
        province = province_shapes[unit["parentId"]]
        if result.is_empty or result.difference(province).area / result.area > 0.02:
            raise ValueError(f"Ward geometry outside expected province for {geo_id}")
        results.setdefault(unit["parentId"], []).append(feature(geo_id, result))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cod_zip", type=Path)
    parser.add_argument("osm_json", type=Path)
    parser.add_argument("--ward-relations", type=Path, default=DEFAULT_WARD_RELATIONS)
    args = parser.parse_args(argv)

    output = DATA / "v1-boundaries"
    source_dir = output if (output / "manifest.json").exists() else DATA / "v1"
    manifest = json.loads((source_dir / "manifest.json").read_text(encoding="utf-8"))
    sample_units = json.loads((source_dir / manifest["files"]["units"]).read_text(encoding="utf-8"))
    unit_lookup = {row["id"]: row for row in sample_units}
    relations = read_ward_relation_mapping(args.ward_relations, sample_units)
    province_units, province_features = read_provinces(args.cod_zip)
    ward_features = read_wards(args.osm_json, relations, unit_lookup, province_features)
    province_lookup = {row["id"]: row for row in province_units}
    output_units = [
        next(row for row in sample_units if row["level"] == "country"),
        *(unit_lookup.get(row["id"], row) for row in province_units),
        *(row for row in sample_units if row["level"] == "ward"),
    ]
    if len({row["id"] for row in output_units}) != len(output_units):
        raise ValueError("Duplicate administrative unit ids")
    if any(row["parentId"] not in province_lookup for row in output_units if row["level"] == "ward"):
        raise ValueError("Ward catalog contains a parent absent from COD-AB provinces")
    manifest.update(
        geometryMode="boundary",
        geometrySource={
            "label": "OCHA COD-AB v02 / OpenStreetMap",
            "locator": "https://data.humdata.org/dataset/cod-ab-vnm",
            "license": "Tỉnh: CC BY 3.0 IGO · Phường: ODbL 1.0",
            "notes": f"Địa giới {len(province_features)} tỉnh từ OCHA ROAP/HDX, nguồn GSO, giản lược theo đường biên chung. {len(relations)} phường từ các quan hệ OSM được khai báo trong {args.ward_relations.name}; chỉ dùng tham chiếu.",
            "wardAttribution": {
                "label": "© OpenStreetMap contributors · ODbL 1.0",
                "locator": "https://www.openstreetmap.org/copyright",
            },
        },
        coverage={"provinceCount": len(province_features), "wardCount": sum(map(len, ward_features.values()))},
    )
    manifest["files"].pop("wards", None)
    manifest["files"]["wardsByProvince"] = {province: f"wards/{province}.geojson" for province in sorted(ward_features)}
    write(output / "manifest.json", manifest)
    write(output / manifest["files"]["units"], output_units)
    write(output / "provinces.geojson", collection(province_features))
    for province, wards in ward_features.items():
        write(output / manifest["files"]["wardsByProvince"][province], collection(sorted(wards, key=lambda row: row["properties"]["geoId"])))
    for key in ("dictionary", "observations", "evidence"):
        file = manifest["files"][key]
        if source_dir != output:
            (output / file).write_bytes((source_dir / file).read_bytes())


if __name__ == "__main__":
    main()
