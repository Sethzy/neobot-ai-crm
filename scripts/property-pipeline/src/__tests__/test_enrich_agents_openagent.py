"""Tests for OpenAgent contact extraction logic."""

from src.enrich_agents_openagent import extract_contact


SAMPLE_HTML = """
<html>
<body>
<nav>
  <a href="tel:+6591766109"><img/>Call</a>
  <a href="https://wa.me/91766109?text=Hi%20Kavin"><img/>WhatsApp</a>
  <a href="mailto:kavinkuah88@hotmail.com?body=Hey"><img/>Email</a>
</nav>
<img src="https://example.supabase.co/storage/v1/object/public/agent-photos/R043039D.webp" alt="KUAH KAI PIN, KAVIN (KAVIN KUAH)" width="80" height="80"/>
</body>
</html>
"""

SAMPLE_HTML_NO_CONTACT = """
<html>
<body>
<h1>Agent Not Found</h1>
<button>Claim profile</button>
</body>
</html>
"""

SAMPLE_HTML_PARTIAL = """
<html>
<body>
<a href="tel:+6581234567">Call</a>
<button>Claim profile</button>
</body>
</html>
"""


def test_extract_all_fields():
    contact = extract_contact("R043039D", SAMPLE_HTML)
    assert contact.registration_no == "R043039D"
    assert contact.mobile_phone == "+6591766109"
    assert contact.whatsapp_number == "91766109"
    assert contact.email == "kavinkuah88@hotmail.com"
    assert contact.photo_url is not None
    assert contact.has_any is True


def test_extract_no_contact():
    contact = extract_contact("R999999Z", SAMPLE_HTML_NO_CONTACT)
    assert contact.mobile_phone is None
    assert contact.email is None
    assert contact.whatsapp_number is None
    assert contact.has_any is False


def test_extract_partial():
    contact = extract_contact("R111111A", SAMPLE_HTML_PARTIAL)
    assert contact.mobile_phone == "+6581234567"
    assert contact.email is None
    assert contact.whatsapp_number is None
    assert contact.has_any is True
