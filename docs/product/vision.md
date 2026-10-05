# Product Vision

**Project:** Bakery Orders (working name)
**Status:** Draft
**Phase:** Sprint 0 — Product Definition

## 1. Context

Bakery Orders is a B2B order management application designed for a bakery/confectionery that receives recurring orders from multiple external businesses.

The current process relies heavily on WhatsApp. External establishments send their orders directly to the bakery manager, who manually forwards them to the production team.

This creates unnecessary operational dependency on one person and limits visibility into order preparation, fulfillment issues, and delivery status.

The estimated operational volume is approximately 50 orders per day.

## 2. Product Vision

Build a centralized, accessible, and reliable web application that allows external businesses to create orders independently while enabling the bakery's production team and management to coordinate and monitor the complete order lifecycle.

The application must simplify existing workflows rather than introduce unnecessary operational complexity.

## 3. Target Users

### Customer

An authorized external business that regularly purchases bakery products.

### Kitchen

Authorized bakery employees responsible for preparing orders, recording product availability, and managing production progress.

### Manager

An administrative user responsible for supervising orders, maintaining the product catalog, managing external establishments, and reviewing operational incidents.

## 4. Core Experience

The customer accesses the application through a link provided in the existing WhatsApp conversation with the bakery.

From the application, the customer can browse a structured product catalog, select quantities, build a cart, and confirm an order.

Once confirmed, the order becomes available to Kitchen and Manager through synchronized operational interfaces.

Kitchen manages preparation, records completed quantities, and documents any products or quantities that cannot be supplied.

The customer can follow order progress, view fulfillment changes, and confirm receipt once the order has been dispatched and physically received.

The manager maintains visibility over the entire process.

## 5. MVP Goals

- Eliminate manual order forwarding as an operational dependency.
- Centralize incoming B2B orders.
- Provide structured product selection.
- Enable real-time order visibility.
- Track preparation progress at order-item level.
- Support partial fulfillment without requiring customer approval.
- Preserve original requested quantities and operational history.
- Allow customers to review and repeat previous orders.
- Allow management to supervise orders, products, establishments, and operational incidents.

## 6. Initial Product Boundaries

The MVP will not include:

- Online payments or billing.
- Product prices.
- Inventory accounting.
- Delivery route management.
- Dedicated courier roles.
- Native Android/iOS applications.
- WhatsApp Business API integration.
- Advanced business analytics.
- Offline operation.

## 7. Quality Attributes

The application must prioritize:

- Security by design.
- Clear authorization boundaries.
- Maintainability and modularity.
- SOLID principles.
- Test-driven development.
- Data integrity and auditability.
- Responsive interfaces.
- Low operational and infrastructure costs.
- Controlled and incremental evolution.

## 8. Success Criteria

The MVP is considered functionally successful when an external establishment can independently create an order, the production team can receive and process it, management can supervise its progress, and the establishment can confirm final receipt without depending on manual WhatsApp forwarding.

The solution should be suitable for a practical demonstration to the bakery manager and designed with the possibility of future operational adoption.