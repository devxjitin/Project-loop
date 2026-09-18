import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException

from app.main import parse_classifications, require_internal_token


class AiServiceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_token = os.environ.get("AI_SERVICE_TOKEN")
        os.environ["AI_SERVICE_TOKEN"] = "test-internal-token"

    def tearDown(self) -> None:
        if self.previous_token is None:
            os.environ.pop("AI_SERVICE_TOKEN", None)
        else:
            os.environ["AI_SERVICE_TOKEN"] = self.previous_token

    def test_accepts_complete_sentiment_classification(self) -> None:
        result = parse_classifications(
            '{"classifications":[{"id":"a","sentiment":"positive"},{"id":"b","sentiment":"neutral"}]}',
            {"a", "b"},
        )
        self.assertEqual([item.sentiment for item in result], ["positive", "neutral"])

    def test_rejects_missing_or_duplicate_classifications(self) -> None:
        with self.assertRaises(HTTPException) as error:
            parse_classifications('{"classifications":[{"id":"a","sentiment":"positive"}]}', {"a", "b"})
        self.assertEqual(error.exception.status_code, 502)

    def test_internal_token_requires_exact_value(self) -> None:
        require_internal_token("test-internal-token")
        with self.assertRaises(HTTPException) as error:
            require_internal_token("wrong-token")
        self.assertEqual(error.exception.status_code, 401)
