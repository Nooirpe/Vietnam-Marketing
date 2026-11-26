"""Build the boundary snapshot from the pinned COD-AB ZIP and OSM Overpass response.

Usage: python scripts/build_boundaries.py cod-vnm.zip osm-2025.json
Requires Shapely 2.1. The inputs are read-only. See README for source URLs.
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

from shapely import coverage_is_valid, coverage_simplify, make_valid
from shapely.geometry import LineString, MultiPolygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import polygonize_full, unary_union

DATA = Path(__file__).resolve().parents[1] / "public" / "data"
PROVINCE_CODES = set("01 04 08 11 12 14 15 19 20 22 24 25 31 33 37 38 40 42 44 46 48 51 52 56 66 68 75 79 80 82 86 91 92 96".split())
WARD_RELATIONS = {19331652: "W00004", 19331651: "W00070", 19260504: "W26740"}


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


def read_wards(path, units, provinces):
    osm = json.loads(path.read_text(encoding="utf-8"))
    if {row["id"] for row in osm["elements"]} != WARD_RELATIONS.keys():
        raise ValueError("Missing sample ward relations")
    province_shapes = {row["properties"]["geoId"]: shape(row["geometry"]) for row in provinces}
    results = {}
    for row in osm["elements"]:
        geo_id = WARD_RELATIONS[row["id"]]
        unit = units[geo_id]
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


def main():
    cod_path, osm_path = map(Path, sys.argv[1:])
    demo = DATA / "v1"
    output = DATA / "v1-boundaries"
    manifest = json.loads((demo / "manifest.json").read_text(encoding="utf-8"))
    sample_units = json.loads((demo / "geo_units.json").read_text(encoding="utf-8"))
    unit_lookup = {row["id"]: row for row in sample_units}
    province_units, province_features = read_provinces(cod_path)
    ward_features = read_wards(osm_path, unit_lookup, province_features)
    manifest.update(
        datasetVersion="demo-2-boundaries",
        geometryMode="boundary",
        geometrySource={
            "label": "OCHA COD-AB v02 / OpenStreetMap",
            "locator": "https://data.humdata.org/dataset/cod-ab-vnm",
            "license": "Tỉnh: CC BY 3.0 IGO · Phường: ODbL 1.0",
            "notes": "Địa giới 34 tỉnh từ OCHA ROAP/HDX, nguồn GSO, giản lược theo đường biên chung. Ba phường từ © OpenStreetMap contributors, truy vấn lịch sử 25/09/2025; chỉ dùng tham chiếu.",
            "wardAttribution": {
                "label": "© OpenStreetMap contributors · ODbL 1.0",
                "locator": "https://www.openstreetmap.org/copyright",
            },
        },
        coverage={"provinceCount": len(province_features), "wardCount": sum(map(len, ward_features.values()))},
    )
    manifest["files"].pop("wards")
    manifest["files"]["wardsByProvince"] = {province: f"wards/{province}.geojson" for province in sorted(ward_features)}
    write(output / "manifest.json", manifest)
    write(output / "geo_units.json", [sample_units[0], *(unit_lookup.get(row["id"], row) for row in province_units), *(row for row in sample_units if row["level"] == "ward")])
    write(output / "provinces.geojson", collection(province_features))
    for province, wards in ward_features.items():
        write(output / manifest["files"]["wardsByProvince"][province], collection(sorted(wards, key=lambda row: row["properties"]["geoId"])))
    for key in ("dictionary", "observations", "evidence"):
        file = manifest["files"][key]
        (output / file).write_bytes((demo / file).read_bytes())


if __name__ == "__main__":
    main()
