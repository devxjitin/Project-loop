import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException

from app.main import AnswerResponse, Citation, NO_ANSWER, marker_ids, parse_classifications, require_internal_token, validate_answer


class AiServiceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_token = os.environ.get("AI_SERVICE_TOKEN")
        os.environ["AI_SERVICE_TOKEN"] = "test-internal-token"

    def tearDown(self) -> None:
        if self.previous_token is None:
            os.environ.pop("AI_SERVICE_TOKEN", None)
        else:
            os.environ["AI_SERVICE_TOKEN"] = self.previous_token

    def test_marker_ids_accepts_common_formats(self) -> None:
        text = "Slow [source:a] and buggy [source: b] and rude [source:c, d][source:a]."
        self.assertEqual(marker_ids(text), ["a", "b", "c", "d"])

    def test_answer_with_valid_markers_gets_citations_from_the_markers(self) -> None:
        raw = AnswerResponse(answer="Billing is confusing [source:a].", citations=[Citation(feedback_id="zzz")])
        result = validate_answer(raw, {"a", "b"})
        self.assertEqual([citation.feedback_id for citation in result.citations], ["a"])

    def test_honest_no_answer_is_valid_even_with_a_stray_citation(self) -> None:
        raw = AnswerResponse(answer=NO_ANSWER, citations=[Citation(feedback_id="a")])
        result = validate_answer(raw, {"a"})
        self.assertEqual((result.answer, result.citations), (NO_ANSWER, []))

    def test_rejects_unknown_source_markers_and_unmarked_claims(self) -> None:
        with self.assertRaises(HTTPException):
            validate_answer(AnswerResponse(answer="Made up [source:nope]."), {"a"})
        with self.assertRaises(HTTPException):
            validate_answer(AnswerResponse(answer="Customers like it.", citations=[Citation(feedback_id="a")]), {"a"})

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
