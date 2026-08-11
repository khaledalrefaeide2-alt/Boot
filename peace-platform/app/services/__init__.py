"""Business logic.

Every mutating function here takes an :class:`~app.services.context.Actor`,
checks the required permission itself, and writes an audit record. HTTP handlers
are thin wrappers over these functions, so the REST API and the server-rendered
dashboard cannot diverge in what they allow.
"""
