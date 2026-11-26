"""Import market and survey CSVs into the schema-v1 static data files."""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


DATA = Path(__file__).resolve().parents[1] / "public" / "data"
PERIOD_PATTERN = re.compile(r"^(\d{4})-Q([1-4])$")
MARKET_HEADERS = {"adminCode", "period", "indicator", "value", "sourceId", "status"}
SURVEY_HEADERS = MARKET_HEADERS | {"low", "high", "segment", "study", "n", "method"}
STATUSES = {"verified", "estimated", "unavailable"}
SURVEY_INDICATORS = {"unmet", "online", "offline", "wtp"}
PERCENT_INDICATORS = {"unmet", "online", "offline"}


def quarter_dates(period: str) -> dict[str, str] | None:
    match = PERIOD_PATTERN.fullmatch(period)
    if not match:
        return None
    year, quarter = int(match.group(1)), int(match.group(2))
    if year < 1:
        return None
    month = (quarter - 1) * 3 + 1
    end_month = month + 2
    if end_month == 2:
        end_day = 28
        if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
            end_day = 29
    elif end_month in {4, 6, 9, 11}:
        end_day = 30
    else:
        end_day = 31
    return {
        "start": f"{year:04d}-{month:02d}-01",
        "end": f"{year:04d}-{end_month:02d}-{end_day:02d}",
    }


def read_csv(path: Path, required_headers: set[str], errors: list[str]) -> list[tuple[int, dict[str, str]]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            headers = set(reader.fieldnames or [])
            missing = sorted(required_headers - headers)
            if missing:
                errors.append(f"{path.name}: thiếu cột bắt buộc: {', '.join(missing)}")
                return []
            return [(line, {key: (value or "").strip() for key, value in row.items() if key is not None})
                    for line, row in enumerate(reader, start=2)]
    except OSError as error:
        errors.append(f"{path}: không đọc được CSV: {error}")
        return []


def number(raw: str, label: str, location: str, errors: list[str]) -> int | float | None:
    try:
        parsed = Decimal(raw)
    except InvalidOperation:
        errors.append(f"{location}: {label} phải là số thập phân dùng dấu chấm, nhận được {raw!r}")
        return None
    if not parsed.is_finite() or parsed < 0:
        errors.append(f"{location}: {label} phải là số hữu hạn không âm")
        return None
    try:
        converted = float(parsed)
    except OverflowError:
        errors.append(f"{location}: {label} vượt phạm vi số có thể lưu")
        return None
    if not math.isfinite(converted):
        errors.append(f"{location}: {label} vượt phạm vi số có thể lưu")
        return None
    if parsed == parsed.to_integral_value():
        return int(parsed)
    return converted


def parse_common(
    row: dict[str, str],
    line: int,
    path: Path,
    units_by_code: dict[str, list[dict[str, Any]]],
    source_ids: set[str],
    errors: list[str],
) -> dict[str, Any] | None:
    location = f"{path.name}:{line}"
    code = row.get("adminCode", "")
    matches = units_by_code.get(code, [])
    if not code or not matches:
        errors.append(f"{location}: adminCode {code!r} không khớp địa bàn trong geo_units.json")
        return None
    if len(matches) != 1:
        errors.append(f"{location}: adminCode {code!r} khớp nhiều địa bàn; không thể xác định duy nhất")
        return None

    period = row.get("period", "")
    if quarter_dates(period) is None:
        errors.append(f"{location}: period {period!r} không đúng định dạng YYYY-Q1 đến YYYY-Q4")
        return None
    source_id = row.get("sourceId", "")
    if source_id not in source_ids:
        errors.append(f"{location}: sourceId {source_id!r} chưa khai báo trong manifest.sources")
        return None
    status = row.get("status", "")
    if status not in STATUSES:
        errors.append(f"{location}: status {status!r} không hợp lệ")
        return None
    return {
        "geoId": matches[0]["id"],
        "period": period,
        "sourceId": source_id,
        "status": status,
        "location": location,
    }


def import_market(
    path: Path,
    units_by_code: dict[str, list[dict[str, Any]]],
    indicators: dict[str, dict[str, Any]],
    source_ids: set[str],
    errors: list[str],
) -> tuple[list[dict[str, Any]], set[str]]:
    grouped: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    seen: dict[tuple[str, str, str], str] = {}
    periods: set[str] = set()
    for line, row in read_csv(path, MARKET_HEADERS, errors):
        location = f"{path.name}:{line}"
        common = parse_common(row, line, path, units_by_code, source_ids, errors)
        if common is None:
            continue
        periods.add(common["period"])
        code = row.get("indicator", "")
        if code not in indicators or indicators[code].get("kind") != "market":
            errors.append(f"{location}: indicator {code!r} không phải chỉ tiêu thị trường đã khai báo")
            continue
        key = (common["geoId"], common["period"], code)
        if key in seen:
            errors.append(f"{location}: trùng khóa {key}; lần đầu tại {seen[key]}")
            continue
        seen[key] = location

        raw_value = row.get("value", "")
        value: int | float | None
        missing_reason = row.get("reason", "") or "Không có giá trị trong CSV nguồn"
        if not raw_value:
            if common["status"] != "unavailable":
                errors.append(f"{location}: giá trị trống cần status=unavailable")
                continue
            value = None
        else:
            if common["status"] == "unavailable":
                errors.append(f"{location}: status=unavailable không thể có giá trị số")
                continue
            value = number(raw_value, "value", location, errors)
            if value is None:
                continue
            if code == "population" and not isinstance(value, int):
                errors.append(f"{location}: population phải là số nguyên")
                continue

        group_key = (common["geoId"], common["period"], common["sourceId"], common["status"])
        record = grouped.setdefault(group_key, {
            "geoId": common["geoId"], "period": common["period"], "sourceId": common["sourceId"],
            "status": common["status"], "values": {}, "missingReasons": {},
        })
        record["values"][code] = value
        if value is None:
            record["missingReasons"][code] = missing_reason

    records = sorted(grouped.values(), key=lambda row: (row["geoId"], row["period"], row["sourceId"], row["status"]))
    return records, periods


def import_survey(
    path: Path,
    units_by_code: dict[str, list[dict[str, Any]]],
    indicators: dict[str, dict[str, Any]],
    source_ids: set[str],
    errors: list[str],
) -> tuple[list[dict[str, Any]], set[str]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    seen: dict[tuple[str, str, str, str, str], str] = {}
    periods: set[str] = set()
    for line, row in read_csv(path, SURVEY_HEADERS, errors):
        location = f"{path.name}:{line}"
        common = parse_common(row, line, path, units_by_code, source_ids, errors)
        if common is None:
            continue
        periods.add(common["period"])
        segment, study = row.get("segment", ""), row.get("study", "")
        if not segment or not study:
            errors.append(f"{location}: segment và study không được để trống")
            continue
        code = row.get("indicator", "")
        if code not in SURVEY_INDICATORS or indicators.get(code, {}).get("kind") != "survey":
            errors.append(f"{location}: indicator {code!r} không phải chỉ tiêu khảo sát được hỗ trợ")
            continue
        key = (common["geoId"], common["period"], segment, study, code)
        if key in seen:
            errors.append(f"{location}: trùng khóa {key}; lần đầu tại {seen[key]}")
            continue
        seen[key] = location

        answer: dict[str, Any] = {"indicator": code, "location": location, **common}
        if common["status"] == "unavailable":
            if any(row.get(field, "") for field in ("value", "low", "high", "n", "method")):
                errors.append(f"{location}: status=unavailable cần để trống value, low, high, n và method")
                continue
            answer["reason"] = row.get("reason", "") or "Không có dữ liệu khảo sát trong CSV nguồn"
        else:
            if not row.get("n") or not row.get("method"):
                errors.append(f"{location}: n và method bắt buộc với khảo sát có dữ liệu")
                continue
            try:
                sample_size = int(row["n"])
            except ValueError:
                errors.append(f"{location}: n phải là số nguyên dương")
                continue
            if sample_size <= 0:
                errors.append(f"{location}: n phải là số nguyên dương")
                continue
            if code == "wtp":
                if row.get("value", ""):
                    errors.append(f"{location}: với wtp hãy dùng low và high, không dùng value")
                    continue
                low = number(row.get("low", ""), "low", location, errors)
                high = number(row.get("high", ""), "high", location, errors)
                if low is None or high is None:
                    continue
                if low > high:
                    errors.append(f"{location}: low không thể lớn hơn high")
                    continue
                answer["value"] = {"low": low, "high": high}
            else:
                if row.get("low", "") or row.get("high", ""):
                    errors.append(f"{location}: low và high chỉ dùng cho indicator=wtp")
                    continue
                parsed_value = number(row.get("value", ""), "value", location, errors)
                if parsed_value is None:
                    continue
                if parsed_value > 100:
                    errors.append(f"{location}: {code} phải nằm trong khoảng 0–100")
                    continue
                answer["value"] = parsed_value
            answer["n"] = sample_size
            answer["method"] = row["method"]

        group_key = (common["geoId"], common["period"], segment, study)
        grouped[group_key].append(answer)

    records: list[dict[str, Any]] = []
    for (geo_id, period, segment, study), answers in sorted(grouped.items()):
        first = answers[0]
        metadata = {(row["sourceId"], row["status"], row.get("n"), row.get("method")) for row in answers}
        if len(metadata) != 1:
            errors.append(f"{first['location']}: sourceId, status, n và method phải nhất quán trong cùng khảo sát")
            continue
        source_id, status, sample_size, method = next(iter(metadata))
        if status == "unavailable":
            reasons = sorted({row["reason"] for row in answers})
            records.append({
                "geoId": geo_id, "period": period, "segment": segment, "study": study,
                "sourceId": source_id, "status": "unavailable", "evidenceState": "no_evidence",
                "method": None, "n": None, "answers": None, "reason": "; ".join(reasons),
            })
            continue
        present = {row["indicator"] for row in answers}
        if present != SURVEY_INDICATORS:
            missing = sorted(SURVEY_INDICATORS - present)
            errors.append(f"{first['location']}: khảo sát thiếu chỉ tiêu {', '.join(missing)}")
            continue
        values = {row["indicator"]: row["value"] for row in answers}
        if abs(values["online"] + values["offline"] - 100) > 0.100000001:
            errors.append(f"{first['location']}: online và offline phải có tổng bằng 100%")
            continue
        records.append({
            "geoId": geo_id, "period": period, "segment": segment, "study": study,
            "sourceId": source_id, "status": status, "evidenceState": "available",
            "method": method, "n": sample_size,
            "answers": {
                "unmet": values["unmet"], "online": values["online"], "offline": values["offline"],
                "wtp": values["wtp"],
            },
        })
    return records, periods


def import_datasets(
    market_path: Path,
    survey_path: Path,
    manifest: dict[str, Any],
    units: list[dict[str, Any]],
    indicators: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, str]], list[str]]:
    errors: list[str] = []
    units_by_code: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for unit in units:
        units_by_code[unit["code"]].append(unit)
    indicators_by_code = {row["code"]: row for row in indicators}
    source_ids = set(manifest["sources"])
    observations, market_periods = import_market(
        market_path, units_by_code, indicators_by_code, source_ids, errors,
    )
    evidence, survey_periods = import_survey(
        survey_path, units_by_code, indicators_by_code, source_ids, errors,
    )
    periods = dict(manifest["periods"])
    for period in sorted(market_periods | survey_periods):
        dates = quarter_dates(period)
        if dates:
            periods[period] = dates
    if not observations and not evidence:
        errors.append("Không có bản ghi hợp lệ; không thay đổi dữ liệu hiện có")
    return observations, evidence, periods, errors


def write_json(path: Path, value: Any) -> Path:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
                         encoding="utf-8")
    return temporary


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("market_csv", type=Path)
    parser.add_argument("survey_csv", type=Path)
    parser.add_argument("--data-dir", type=Path, default=DATA / "v1-boundaries")
    parser.add_argument(
        "--real-source-id", action="append", default=[], metavar="ID",
        help="Attest that a registered source is real; repeat for every manifest source before clearing isDemo",
    )
    args = parser.parse_args(argv)
    data_dir: Path = args.data_dir
    try:
        manifest_path = data_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = manifest["files"]
        units = json.loads((data_dir / files["units"]).read_text(encoding="utf-8"))
        indicators = json.loads((data_dir / files["dictionary"]).read_text(encoding="utf-8"))
        observations, evidence, periods, errors = import_datasets(
            args.market_csv, args.survey_csv, manifest, units, indicators,
        )
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"Không thể đọc bộ dữ liệu v1: {error}", file=sys.stderr)
        return 1
    if errors:
        print("Không nhập dữ liệu do lỗi:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    declared_sources = set(manifest["sources"])
    unknown_attestations = sorted(set(args.real_source_id) - declared_sources)
    if unknown_attestations:
        print(f"sourceId chưa khai báo trong manifest.sources: {', '.join(unknown_attestations)}", file=sys.stderr)
        return 1
    manifest["periods"] = periods
    attested_sources = set(args.real_source_id)
    all_sources_real = bool(declared_sources) and declared_sources <= attested_sources
    has_demo_source = any(
        source_id.upper().startswith("SIM")
        or any(marker in source["label"].casefold() for marker in ("mô phỏng", "demo", "simulated"))
        for source_id, source in manifest["sources"].items()
    )
    manifest["isDemo"] = not (all_sources_real and not has_demo_source)

    output_paths = [
        (data_dir / files["observations"], observations),
        (data_dir / files["evidence"], evidence),
        (manifest_path, manifest),
    ]
    temporaries: list[tuple[Path, Path]] = []
    try:
        for path, value in output_paths:
            temporaries.append((write_json(path, value), path))
        for temporary, target in temporaries:
            os.replace(temporary, target)
    except OSError as error:
        for temporary, _ in temporaries:
            temporary.unlink(missing_ok=True)
        print(f"Không thể ghi bộ dữ liệu: {error}", file=sys.stderr)
        return 1

    print(f"Đã nhập {len(observations)} dòng thị trường và {len(evidence)} nhóm khảo sát.")
    print(f"Đã cập nhật {len(periods)} kỳ đo; isDemo={str(manifest['isDemo']).lower()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
