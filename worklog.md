---
Task ID: 1
Agent: Main Agent
Task: Build Cadastro de Clientes viewer - XLSX data table with parsed columns

Work Log:
- Inspected uploaded XLSX file structure: found "Consulta CNPJ" sheet with 2080 rows, 21 columns
- Discovered that target fields (codigo, ie_rg, celular, fax, cadastro, ultima_venda, reg_simples, situacao, vendedor) are embedded in "Observações" column as semicolon-separated key-value pairs
- Installed xlsx (SheetJS) library for Node.js backend parsing
- Created backend API route at /api/clientes that reads the XLSX, parses Observações field, supports search/filter/pagination
- Added in-memory caching with 5-minute TTL for performance
- Added summary stats (total, ativos, inativos) to API response
- Built frontend page with shadcn/ui components: stats cards, search bar, situacao/vendedor filters, data table with all required columns, pagination
- All lint checks pass, dev server running without errors

Stage Summary:
- Key columns (codigo, ie_rg, celular, fax, cadastro, ultima_venda, reg_simples, situacao, vendedor) displayed as separate table columns
- Also includes Razão Social, CNPJ, and Cidade/UF for context
- Backend parses semicolon-delimited key-value pairs from Observações column
- App fully functional at / route with 2080 client records
