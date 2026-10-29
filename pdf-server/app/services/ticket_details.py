"""Read-only production details, including legacy artwork snapshots."""
from copy import deepcopy


def ticket_sections(configuration, item_spec=None):
    sections = deepcopy(configuration.get("sections") or [])
    raw = configuration.get("raw_spec") or item_spec or {}
    seen = {str(i.get("label", "")).lower() for s in sections for i in s.get("items", [])}
    extras = []
    for label, value in (raw.get("selected_options") or {}).items():
        if label.lower() in seen or not value:
            continue
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        extras.append({"label": label, "value": str(value)})
    if extras:
        sections.append({"title": "Selected options", "items": extras})
    return sections


def ticket_order_details(order, customer, delivery):
    return {
        "company": order.get("company_name") or customer.get("company") or delivery.get("company_name") or "",
        "po_number": order.get("po_number") or "",
        "fulfilment": order.get("fulfillment_type") or order.get("fulfilment_type") or order.get("delivery_method") or "collection",
        "due": order.get("date_required") or order.get("required_by") or order.get("delivery_date"),
        "turnaround": order.get("turnaround_time_text") or order.get("turnaround"),
    }