import markdown


class ExportService:
    """Export scenarios to MD and PDF."""

    def export_md(self, scenario: str) -> str:
        return scenario

    def export_pdf(self, scenario: str) -> bytes:
        from weasyprint import HTML

        html_content = markdown.markdown(
            scenario, extensions=["tables", "fenced_code"]
        )
        full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body {{ font-family: 'DejaVu Sans', sans-serif; margin: 2cm; font-size: 11pt; line-height: 1.5; }}
h1 {{ font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 8px; }}
h2 {{ font-size: 16pt; margin-top: 1.5em; }}
h3 {{ font-size: 13pt; margin-top: 1em; }}
table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
th, td {{ border: 1px solid #ccc; padding: 6px 10px; text-align: left; }}
th {{ background: #f0f0f0; }}
blockquote {{ border-left: 3px solid #666; padding-left: 1em; margin-left: 0; color: #333; }}
hr {{ border: none; border-top: 1px solid #ccc; margin: 2em 0; }}
</style>
</head>
<body>{html_content}</body>
</html>"""
        pdf_bytes = HTML(string=full_html).write_pdf()
        return pdf_bytes


export_service = ExportService()
