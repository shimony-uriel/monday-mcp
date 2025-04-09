# monday.com AI Tools

This repository, maintained by the monday.com AI team, provides a comprehensive set of tools for AI agent developers who want to integrate with monday.com.

## Packages

### 1. Monday API MCP (`@mondaydotcomorg/monday-api-mcp`)

A server implementation for the Model Context Protocol (MCP) that provides an interface to interact with monday.com API. This package is designed to be run using NPX and can be easily integrated with various AI platforms.

[Learn more about Monday API MCP →](./packages/monday-api-mcp/README.md)

Key features:

- Easy integration with MCP clients such as Cursor and Claude Desktop
- Configurable API token and version
- Support for read-only mode
- Dynamic API tools capability

### 2. Agent Toolkit (`@mondaydotcomorg/agent-toolkit`)

A powerful toolkit for building AI agents that interact with the monday.com API. It provides a set of tools and utilities to help you create AI-powered integrations with monday.com, supporting both OpenAI and Model Context Protocol (MCP) implementations.

[Learn more about Agent Toolkit →](./packages/agent-toolkit/README.md)

Key features:

- Pre-built tools for common monday.com operations
- Support for OpenAI integrations
- MCP server implementation

## License

MIT
