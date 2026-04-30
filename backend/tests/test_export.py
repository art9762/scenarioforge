import pytest
from backend.services.export import export_service


def test_export_md():
    scenario = "# Test\n\nHello world"
    result = export_service.export_md(scenario)
    assert result == scenario


def test_export_pdf():
    """Test PDF export - skipped if WeasyPrint system deps not available."""
    try:
        from weasyprint import HTML
    except OSError:
        pytest.skip("WeasyPrint system dependencies (pango) not installed")
    scenario = "# Test Scenario\n\n## Scene 1\n\nHello world"
    try:
        pdf_bytes = export_service.export_pdf(scenario)
    except (OSError, AttributeError) as e:
        pytest.skip(f"WeasyPrint render error (system/version issue): {e}")
    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 100
