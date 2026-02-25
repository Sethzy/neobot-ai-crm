"""
Brand application module for Sunder document styling.
Applies consistent branding to Excel, PowerPoint, and PDF documents.
"""

from typing import Any


class BrandFormatter:
    """Apply Sunder brand guidelines to documents."""

    # Brand color definitions
    COLORS = {
        "primary": {
            "sunder_green": {"hex": "#2D6A4F", "rgb": (45, 106, 79)},
            "sunder_green_light": {"hex": "#40916C", "rgb": (64, 145, 108)},
            "sunder_green_dark": {"hex": "#1B4332", "rgb": (27, 67, 50)},
            "white": {"hex": "#FFFFFF", "rgb": (255, 255, 255)},
        },
        "secondary": {
            "success_green": {"hex": "#19A249", "rgb": (25, 162, 73)},
            "warning_amber": {"hex": "#D87708", "rgb": (216, 119, 8)},
            "info_blue": {"hex": "#2762EA", "rgb": (39, 98, 234)},
            "content_gray": {"hex": "#1F2937", "rgb": (31, 41, 55)},
            "border_gray": {"hex": "#E4E4E7", "rgb": (228, 228, 231)},
            "light_gray": {"hex": "#F8F9FA", "rgb": (248, 249, 250)},
        },
    }

    # Font definitions
    FONTS = {
        "primary": "Figtree",
        "display": "Playfair Display",
        "logo": "DM Sans",
        "fallback": ["system-ui", "-apple-system", "sans-serif"],
        "sizes": {"h1": 32, "h2": 24, "h3": 18, "body": 11, "caption": 9},
        "weights": {"regular": 400, "medium": 500, "semibold": 600, "bold": 700},
    }

    # Company information
    COMPANY = {
        "name": "Sunder Inc.",
        "tagline": "Document chaos, intelligently solved.",
        "copyright": "© 2025 Sunder Inc. All rights reserved.",
        "website": "sunder.ai",
        "logo_path": "assets/sunder_logo.svg",
    }

    def __init__(self):
        """Initialize brand formatter with standard settings."""
        self.colors = self.COLORS
        self.fonts = self.FONTS
        self.company = self.COMPANY

    def format_excel(self, workbook_config: dict[str, Any]) -> dict[str, Any]:
        """
        Apply brand formatting to Excel workbook configuration.

        Args:
            workbook_config: Excel workbook configuration dictionary

        Returns:
            Branded workbook configuration
        """
        branded_config = workbook_config.copy()

        # Apply header formatting
        branded_config["header_style"] = {
            "font": {
                "name": self.fonts["primary"],
                "size": self.fonts["sizes"]["body"],
                "bold": True,
                "color": self.colors["primary"]["white"]["hex"],
            },
            "fill": {"type": "solid", "color": self.colors["primary"]["sunder_green"]["hex"]},
            "alignment": {"horizontal": "center", "vertical": "center"},
            "border": {"style": "thin", "color": self.colors["secondary"]["border_gray"]["hex"]},
        }

        # Apply data cell formatting
        branded_config["cell_style"] = {
            "font": {
                "name": self.fonts["primary"],
                "size": self.fonts["sizes"]["body"],
                "color": self.colors["secondary"]["content_gray"]["hex"],
            },
            "alignment": {"horizontal": "left", "vertical": "center"},
        }

        # Apply alternating row colors
        branded_config["alternating_rows"] = {
            "enabled": True,
            "color": self.colors["secondary"]["light_gray"]["hex"],
        }

        # Chart color scheme
        branded_config["chart_colors"] = [
            self.colors["primary"]["sunder_green"]["hex"],
            self.colors["secondary"]["success_green"]["hex"],
            self.colors["secondary"]["warning_amber"]["hex"],
            self.colors["secondary"]["info_blue"]["hex"],
        ]

        return branded_config

    def format_powerpoint(self, presentation_config: dict[str, Any]) -> dict[str, Any]:
        """
        Apply brand formatting to PowerPoint presentation configuration.

        Args:
            presentation_config: PowerPoint configuration dictionary

        Returns:
            Branded presentation configuration
        """
        branded_config = presentation_config.copy()

        # Slide master settings
        branded_config["master"] = {
            "background_color": self.colors["primary"]["white"]["hex"],
            "title_area": {
                "font": self.fonts["display"],
                "size": self.fonts["sizes"]["h1"],
                "color": self.colors["primary"]["sunder_green"]["hex"],
                "bold": True,
                "position": {"x": 0.5, "y": 0.15, "width": 9, "height": 1},
            },
            "content_area": {
                "font": self.fonts["primary"],
                "size": self.fonts["sizes"]["body"],
                "color": self.colors["secondary"]["content_gray"]["hex"],
                "position": {"x": 0.5, "y": 2, "width": 9, "height": 5},
            },
            "footer": {
                "show_slide_number": True,
                "show_date": True,
                "company_name": self.company["name"],
            },
        }

        # Title slide template
        branded_config["title_slide"] = {
            "background": self.colors["primary"]["sunder_green"]["hex"],
            "title_color": self.colors["primary"]["white"]["hex"],
            "subtitle_color": self.colors["primary"]["white"]["hex"],
            "include_logo": True,
            "logo_position": {"x": 0.5, "y": 0.5, "width": 2},
        }

        # Content slide template
        branded_config["content_slide"] = {
            "title_bar": {
                "background": self.colors["primary"]["sunder_green"]["hex"],
                "text_color": self.colors["primary"]["white"]["hex"],
                "height": 1,
            },
            "bullet_style": {"level1": "•", "level2": "○", "level3": "▪", "indent": 0.25},
        }

        # Chart defaults
        branded_config["charts"] = {
            "color_scheme": [
                self.colors["primary"]["sunder_green"]["hex"],
                self.colors["secondary"]["success_green"]["hex"],
                self.colors["secondary"]["warning_amber"]["hex"],
                self.colors["secondary"]["info_blue"]["hex"],
            ],
            "gridlines": {"color": self.colors["secondary"]["border_gray"]["hex"], "width": 0.5},
            "font": {"name": self.fonts["primary"], "size": self.fonts["sizes"]["caption"]},
        }

        return branded_config

    def format_pdf(self, document_config: dict[str, Any]) -> dict[str, Any]:
        """
        Apply brand formatting to PDF document configuration.

        Args:
            document_config: PDF document configuration dictionary

        Returns:
            Branded document configuration
        """
        branded_config = document_config.copy()

        # Page layout
        branded_config["page"] = {
            "margins": {"top": 1, "bottom": 1, "left": 1, "right": 1},
            "size": "letter",
            "orientation": "portrait",
        }

        # Header configuration
        branded_config["header"] = {
            "height": 0.75,
            "content": {
                "left": {"type": "logo", "width": 1.5},
                "center": {
                    "type": "text",
                    "content": document_config.get("title", "Document"),
                    "font": self.fonts["primary"],
                    "size": self.fonts["sizes"]["body"],
                    "color": self.colors["secondary"]["content_gray"]["hex"],
                },
                "right": {"type": "page_number", "format": "Page {page} of {total}"},
            },
        }

        # Footer configuration
        branded_config["footer"] = {
            "height": 0.5,
            "content": {
                "left": {
                    "type": "text",
                    "content": self.company["copyright"],
                    "font": self.fonts["primary"],
                    "size": self.fonts["sizes"]["caption"],
                    "color": self.colors["secondary"]["border_gray"]["hex"],
                },
                "center": {"type": "date", "format": "%Y-%m-%d"},
                "right": {"type": "text", "content": "Confidential"},
            },
        }

        # Text styles
        branded_config["styles"] = {
            "heading1": {
                "font": self.fonts["display"],
                "size": self.fonts["sizes"]["h1"],
                "color": self.colors["primary"]["sunder_green"]["hex"],
                "bold": True,
                "spacing_after": 12,
            },
            "heading2": {
                "font": self.fonts["primary"],
                "size": self.fonts["sizes"]["h2"],
                "color": self.colors["secondary"]["content_gray"]["hex"],
                "bold": True,
                "spacing_after": 10,
            },
            "heading3": {
                "font": self.fonts["primary"],
                "size": self.fonts["sizes"]["h3"],
                "color": self.colors["secondary"]["content_gray"]["hex"],
                "bold": False,
                "spacing_after": 8,
            },
            "body": {
                "font": self.fonts["primary"],
                "size": self.fonts["sizes"]["body"],
                "color": self.colors["secondary"]["content_gray"]["hex"],
                "line_spacing": 1.15,
                "paragraph_spacing": 12,
            },
            "caption": {
                "font": self.fonts["primary"],
                "size": self.fonts["sizes"]["caption"],
                "color": self.colors["secondary"]["border_gray"]["hex"],
                "italic": True,
            },
        }

        # Table formatting
        branded_config["table_style"] = {
            "header": {
                "background": self.colors["primary"]["sunder_green"]["hex"],
                "text_color": self.colors["primary"]["white"]["hex"],
                "bold": True,
            },
            "rows": {
                "alternating_color": self.colors["secondary"]["light_gray"]["hex"],
                "border_color": self.colors["secondary"]["border_gray"]["hex"],
            },
        }

        return branded_config

    def validate_colors(self, colors_used: list[str]) -> dict[str, Any]:
        """
        Validate that colors match brand guidelines.

        Args:
            colors_used: List of color codes used in document

        Returns:
            Validation results with corrections if needed
        """
        results = {"valid": True, "corrections": [], "warnings": []}

        approved_colors = []
        for category in self.colors.values():
            for color in category.values():
                approved_colors.append(color["hex"].upper())

        for color in colors_used:
            color_upper = color.upper()
            if color_upper not in approved_colors:
                results["valid"] = False
                # Find closest brand color
                closest = self._find_closest_brand_color(color)
                results["corrections"].append(
                    {
                        "original": color,
                        "suggested": closest,
                        "message": f"Non-brand color {color} should be replaced with {closest}",
                    }
                )

        return results

    def _find_closest_brand_color(self, color: str) -> str:
        """Find the closest brand color to a given color."""
        # Simplified - in reality would calculate color distance
        return self.colors["primary"]["sunder_green"]["hex"]

    def apply_watermark(self, document_type: str) -> dict[str, Any]:
        """
        Generate watermark configuration for documents.

        Args:
            document_type: Type of document (draft, confidential, etc.)

        Returns:
            Watermark configuration
        """
        watermarks = {
            "draft": {
                "text": "DRAFT",
                "color": self.colors["secondary"]["border_gray"]["hex"],
                "opacity": 0.1,
                "angle": 45,
                "font_size": 72,
            },
            "confidential": {
                "text": "CONFIDENTIAL",
                "color": self.colors["secondary"]["warning_amber"]["hex"],
                "opacity": 0.1,
                "angle": 45,
                "font_size": 60,
            },
            "sample": {
                "text": "SAMPLE",
                "color": self.colors["secondary"]["info_blue"]["hex"],
                "opacity": 0.15,
                "angle": 45,
                "font_size": 72,
            },
        }

        return watermarks.get(document_type, watermarks["draft"])

    def get_chart_palette(self, num_series: int = 4) -> list[str]:
        """
        Get color palette for charts.

        Args:
            num_series: Number of data series

        Returns:
            List of hex color codes
        """
        palette = [
            self.colors["primary"]["sunder_green"]["hex"],
            self.colors["secondary"]["success_green"]["hex"],
            self.colors["secondary"]["warning_amber"]["hex"],
            self.colors["secondary"]["info_blue"]["hex"],
            self.colors["primary"]["sunder_green_dark"]["hex"],
            self.colors["primary"]["sunder_green_light"]["hex"],
        ]

        return palette[:num_series]

    def format_number(self, value: float, format_type: str = "general") -> str:
        """
        Format numbers according to brand standards.

        Args:
            value: Numeric value to format
            format_type: Type of formatting (currency, percentage, general)

        Returns:
            Formatted string
        """
        if format_type == "currency":
            return f"${value:,.2f}"
        elif format_type == "percentage":
            return f"{value:.1f}%"
        elif format_type == "large_number":
            if value >= 1_000_000:
                return f"{value / 1_000_000:.1f}M"
            elif value >= 1_000:
                return f"{value / 1_000:.1f}K"
            else:
                return f"{value:.0f}"
        else:
            return f"{value:,.0f}" if value >= 1000 else f"{value:.2f}"


def apply_brand_to_document(document_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Main function to apply branding to any document type.

    Args:
        document_type: Type of document ('excel', 'powerpoint', 'pdf')
        config: Document configuration

    Returns:
        Branded configuration
    """
    formatter = BrandFormatter()

    if document_type.lower() == "excel":
        return formatter.format_excel(config)
    elif document_type.lower() in ["powerpoint", "pptx"]:
        return formatter.format_powerpoint(config)
    elif document_type.lower() == "pdf":
        return formatter.format_pdf(config)
    else:
        raise ValueError(f"Unsupported document type: {document_type}")


# Example usage
if __name__ == "__main__":
    # Example Excel configuration
    excel_config = {"title": "Quarterly Report", "sheets": ["Summary", "Details"]}

    branded_excel = apply_brand_to_document("excel", excel_config)
    print("Branded Excel Configuration:")
    print(branded_excel)

    # Example PowerPoint configuration
    ppt_config = {"title": "Business Review", "num_slides": 10}

    branded_ppt = apply_brand_to_document("powerpoint", ppt_config)
    print("\nBranded PowerPoint Configuration:")
    print(branded_ppt)
