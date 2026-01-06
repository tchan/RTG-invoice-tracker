# RTG Invoice Tracker

A web application for uploading and viewing multiple Excel invoice spreadsheets with filtering capabilities.

## Features

- Upload multiple Excel files (.xlsx, .xls) simultaneously
- Automatically combines all invoice data from uploaded files
- Filter by Lesson Date
- Filter by Client Name
- Combined filtering (both filters work together)
- Sortable table columns
- Session-based storage (data persists during browser session)
- Responsive design for mobile and desktop

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Upload Files**: Click the upload area or drag and drop Excel files (.xlsx or .xls)
2. **View Data**: Once uploaded, all invoice data will be displayed in a table
3. **Filter by Date**: Select a Lesson Date to filter invoices
4. **Filter by Client**: Select a Client Name from the dropdown to filter invoices
5. **Sort Columns**: Click on any column header to sort the data
6. **Clear Data**: Use the "Clear Data" button to remove all uploaded data

## Project Structure

```
/
├── app/
│   ├── page.tsx              # Main page component
│   ├── layout.tsx            # Root layout
│   ├── api/upload/route.ts   # File upload API endpoint
│   └── globals.css           # Global styles
├── components/
│   ├── FileUpload.tsx        # File upload component
│   ├── InvoiceTable.tsx      # Table display component
│   └── InvoiceFilters.tsx    # Filter component
├── lib/
│   ├── excelParser.ts        # Excel parsing utilities
│   └── invoiceTypes.ts       # TypeScript type definitions
└── package.json
```

## Technologies

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- xlsx (SheetJS) for Excel parsing

## Notes

- Data is stored in browser sessionStorage and will be cleared when the browser session ends
- The application automatically detects column headers from your Excel files
- Date columns are automatically parsed and formatted for display

