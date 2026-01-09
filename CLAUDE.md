# CLAUDE.md

This file provides guidance for Claude Code when working with this repository.

## Project Overview

RTG Invoice Tracker is a Next.js 14 web application for uploading, managing, and analyzing Excel invoice spreadsheets with distance calculation features using OpenRouteService API.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Excel Parsing**: xlsx library
- **Distance API**: OpenRouteService (API key stored in browser localStorage)

## Project Structure

```
app/
  page.tsx              # Main page - invoice upload and display
  settings/page.tsx     # Settings page for API key configuration
  layout.tsx            # Root layout
  api/
    upload/route.ts     # Excel file upload and parsing endpoint
    geocode/route.ts    # Address geocoding endpoint
    directions/route.ts # Route directions endpoint
    matrix/route.ts     # Distance matrix endpoint

components/
  FileUpload.tsx        # Drag-and-drop file upload component
  InvoiceTable.tsx      # Invoice data display table
  InvoiceFilters.tsx    # Date and client name filter controls
  ClientAddressManager.tsx # Modal for managing client addresses

lib/
  invoiceTypes.ts       # TypeScript interfaces (InvoiceRecord, ParsedInvoiceData, FilterState)
  excelParser.ts        # Excel file parsing and data combination logic
  addressStorage.ts     # localStorage utilities for address management
  routePlanner.ts       # Route planning and optimization
  distanceCalculator.ts # Distance calculation using OpenRouteService

types/                  # Additional TypeScript type definitions
```

## Common Commands

```bash
npm run dev    # Start development server at localhost:3000
npm run build  # Build for production
npm run start  # Start production server
npm run lint   # Run ESLint
```

## Key Features

1. **Excel Upload**: Upload multiple Excel invoice files, which get parsed and combined
2. **Invoice Filtering**: Filter by Lesson Date and Client Name
3. **Total Amount Calculation**: Automatically sums amounts from merged cells (J2:J3)
4. **Distance Calculation**: Calculates kilometers driven between home and client addresses
5. **Address Management**: Store and manage home address and client addresses

## Data Flow

1. Excel files are uploaded via `/api/upload` endpoint
2. Files are parsed using xlsx library in `excelParser.ts`
3. Invoice data is stored in React state and sessionStorage
4. Distances are calculated via OpenRouteService API when addresses are configured
5. Data is displayed in filterable table with calculated kilometers

## Important Notes

- OpenRouteService API key is configured via Settings page and stored in localStorage
- Invoice data persists in sessionStorage during the session
- Client addresses are stored in localStorage for persistence
- Date values are converted between ISO strings (storage) and Date objects (runtime)
