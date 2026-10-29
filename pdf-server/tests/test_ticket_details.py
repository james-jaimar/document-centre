import unittest
from app.services.ticket_details import ticket_sections, ticket_order_details


class TicketDetailsTest(unittest.TestCase):
    def test_deskpad_finishing(self):
        finishing = "Complete deskpad - collated, padded{head} + Corners"
        cfg = {"sections": [], "raw_spec": {"selected_options": {"Finishing Option": finishing}}}
        self.assertEqual(ticket_sections(cfg)[0]["items"][0]["value"], finishing)
        self.assertEqual(cfg["sections"], [])

    def test_no_duplicate_finishing(self):
        cfg = {"sections": [{"items": [{"label": "Finishing Option", "value": "Corners"}]}],
               "raw_spec": {"selected_options": {"Finishing Option": "Corners"}}}
        self.assertEqual(len(ticket_sections(cfg)), 1)

    def test_order_po_company_and_schedule(self):
        fields = ticket_order_details({"po_number": "CMM 2026 - 225", "company_name": "Chameleon Marketing",
                                       "fulfillment_type": "delivery", "date_required": "2026-11-01"}, {}, {})
        self.assertEqual(fields["po_number"], "CMM 2026 - 225")
        self.assertEqual(fields["company"], "Chameleon Marketing")
        self.assertEqual(fields["fulfilment"], "delivery")
        self.assertEqual(fields["due"], "2026-11-01")