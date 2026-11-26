import csv
import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_data import import_datasets, main


MARKET_HEADERS = ["adminCode", "period", "indicator", "value", "sourceId", "status"]
SURVEY_HEADERS = [
    "adminCode", "period", "indicator", "value", "low", "high", "sourceId",
    "status", "n", "method", "segment", "study",
]


class ImportDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest = {
            "periods": {"2025-Q3": {"start": "2025-07-01", "end": "2025-09-30"}},
            "sources": {"MARKET": {"label": "Nguồn thị trường"}, "SURVEY": {"label": "Nguồn khảo sát"}},
        }
        self.units = [
            {"id": "P01", "code": "01", "level": "province"},
            {"id": "W00004", "code": "00004", "level": "ward"},
        ]
        self.indicators = [
            {"code": "population", "kind": "market"},
            {"code": "unmet", "kind": "survey"},
            {"code": "online", "kind": "survey"},
            {"code": "offline", "kind": "survey"},
            {"code": "wtp", "kind": "survey"},
        ]

    def tearDown(self):
        self.temp.cleanup()

    def write_csv(self, name, headers, rows):
        path = self.root / name
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def write_json(self, path, value):
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def survey_row(self, indicator, value="", low="", high="", **overrides):
        row = {
            "adminCode": "00004", "period": "2026-Q1", "indicator": indicator, "value": value,
            "low": low, "high": high, "sourceId": "SURVEY", "status": "verified",
            "n": "25", "method": "Phỏng vấn trực tiếp", "segment": "urban_adults",
            "study": "delivery-2026",
        }
        row.update(overrides)
        return row

    def test_imports_leading_zero_codes_and_registers_quarter_dates(self):
        market = self.write_csv("market.csv", MARKET_HEADERS, [{
            "adminCode": "01", "period": "2026-Q1", "indicator": "population", "value": "1234",
            "sourceId": "MARKET", "status": "verified",
        }])
        survey = self.write_csv("survey.csv", SURVEY_HEADERS, [
            self.survey_row("unmet", "30"),
            self.survey_row("online", "65"),
            self.survey_row("offline", "35"),
            self.survey_row("wtp", low="10000", high="20000"),
        ])

        observations, evidence, periods, errors = import_datasets(
            market, survey, self.manifest, self.units, self.indicators,
        )

        self.assertEqual(errors, [])
        self.assertEqual(observations[0]["geoId"], "P01")
        self.assertEqual(evidence[0]["geoId"], "W00004")
        self.assertEqual(evidence[0]["answers"]["wtp"], {"low": 10000, "high": 20000})
        self.assertEqual(periods["2026-Q1"], {"start": "2026-01-01", "end": "2026-03-31"})

    def test_reports_duplicate_keys_and_unmatched_admin_codes(self):
        market = self.write_csv("market.csv", MARKET_HEADERS, [
            {"adminCode": "01", "period": "2026-Q1", "indicator": "population", "value": "10",
             "sourceId": "MARKET", "status": "verified"},
            {"adminCode": "01", "period": "2026-Q1", "indicator": "population", "value": "11",
             "sourceId": "MARKET", "status": "verified"},
            {"adminCode": "99", "period": "2026-Q1", "indicator": "population", "value": "12",
             "sourceId": "MARKET", "status": "verified"},
        ])
        survey = self.write_csv("survey.csv", SURVEY_HEADERS, [
            self.survey_row("unmet", status="unavailable", n="", method=""),
        ])

        _, evidence, _, errors = import_datasets(market, survey, self.manifest, self.units, self.indicators)

        self.assertTrue(any("trùng khóa" in error for error in errors))
        self.assertTrue(any("adminCode '99'" in error for error in errors))
        self.assertEqual(evidence[0]["evidenceState"], "no_evidence")
        self.assertIsNone(evidence[0]["n"])

    def test_rejects_invalid_percentages_and_incomplete_survey_groups(self):
        market = self.write_csv("market.csv", MARKET_HEADERS, [{
            "adminCode": "01", "period": "2026-Q1", "indicator": "population", "value": "10",
            "sourceId": "MARKET", "status": "verified",
        }])
        survey = self.write_csv("survey.csv", SURVEY_HEADERS, [
            self.survey_row("unmet", "101"),
            self.survey_row("online", "65"),
            self.survey_row("offline", "35"),
            self.survey_row("wtp", low="10000", high="20000"),
        ])

        _, _, _, errors = import_datasets(market, survey, self.manifest, self.units, self.indicators)

        self.assertTrue(any("0–100" in error for error in errors))
        self.assertTrue(any("thiếu chỉ tiêu unmet" in error for error in errors))

    def test_cli_writes_outputs_and_clears_demo_only_after_all_sources_are_attested(self):
        market = self.write_csv("market.csv", MARKET_HEADERS, [{
            "adminCode": "01", "period": "2026-Q1", "indicator": "population", "value": "10",
            "sourceId": "MARKET", "status": "verified",
        }])
        survey = self.write_csv("survey.csv", SURVEY_HEADERS, [
            self.survey_row("unmet", "30"),
            self.survey_row("online", "65"),
            self.survey_row("offline", "35"),
            self.survey_row("wtp", low="10000", high="20000"),
        ])
        data_dir = self.root / "dataset"
        data_dir.mkdir()
        manifest = {
            "schemaVersion": 1,
            "datasetVersion": "test",
            "boundaryVersion": "test",
            "isDemo": True,
            "geometryMode": "schematic",
            "periods": self.manifest["periods"],
            "sources": self.manifest["sources"],
            "coverage": {"provinceCount": 1, "wardCount": 1},
            "files": {
                "units": "geo_units.json", "dictionary": "indicators.json",
                "observations": "market_observations.json", "evidence": "customer_evidence.json",
                "provinces": "provinces.geojson",
            },
        }
        self.write_json(data_dir / "manifest.json", manifest)
        self.write_json(data_dir / "geo_units.json", self.units)
        self.write_json(data_dir / "indicators.json", self.indicators)
        self.write_json(data_dir / "market_observations.json", [])
        self.write_json(data_dir / "customer_evidence.json", [])

        result = main([
            str(market), str(survey), "--data-dir", str(data_dir),
            "--real-source-id", "MARKET", "--real-source-id", "SURVEY",
        ])

        self.assertEqual(result, 0)
        imported_manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
        imported_observations = json.loads((data_dir / "market_observations.json").read_text(encoding="utf-8"))
        self.assertFalse(imported_manifest["isDemo"])
        self.assertIn("2026-Q1", imported_manifest["periods"])
        self.assertEqual(imported_observations[0]["geoId"], "P01")


if __name__ == "__main__":
    unittest.main()
