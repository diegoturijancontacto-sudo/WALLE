# Blog de Notas

A single-page note-blog application that stores notes in **Google Sheets via Google Apps Script** and offers a rich in-browser editing experience.

---

## Features

| Feature | Description |
|---|---|
| **Rich Text Editor** | Bold, italic, underline, strikethrough, headings (H1–H3), bullet/numbered lists, text alignment, hyperlinks, clear formatting |
| **Note metadata** | Title, creation date, author/responsible |
| **Citations** | Link notes to other notes by ID; citations appear as clickable chips in the note view and in the editor |
| **List view** | Card grid with live search/filter |
| **Note map** | Pure-Canvas force-directed graph showing citation relationships — drag nodes, zoom/pan, click to open a note |
| **AppScript backend** | Full CRUD stored in Google Sheets (create, read, update, delete) |
| **Demo / offline mode** | Works out of the box with `localStorage` — no Google account needed for testing |

---

## Project Structure

```
├── index.html                  # Single-page app shell
├── css/
│   └── style.css               # All styles
├── js/
│   └── app.js                  # Application logic (router, views, Canvas node map)
└── appscript/
    ├── Code.gs                 # Google Apps Script backend (CRUD + web app handlers)
    └── appsscript.json         # Apps Script project manifest
```

---

## Quick Start (Demo Mode)

Just open `index.html` in a browser — the app runs entirely in `localStorage` with three sample notes pre-loaded.

```bash
# If you have Python available:
python3 -m http.server 8080
# then open http://localhost:8080
```

---

## Connecting to Google Sheets (AppScript)

### 1 · Create the Apps Script project

1. Open [script.google.com](https://script.google.com) and create a **New project**.
2. Copy the contents of `appscript/Code.gs` into the `Code.gs` file.
3. Copy the contents of `appscript/appsscript.json` into the manifest (enable *Show manifest file* in **Project Settings**).
4. Run `configurarHoja()` once to create the sheet and headers in the linked spreadsheet.

### 2 · Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Select type **Web app**.
3. Set **Execute as**: *Me*.
4. Set **Who has access**: *Anyone*.
   > ⚠️ **Security note:** "Anyone" allows unauthenticated public access. For internal or private use, change to *Anyone within your domain* (Google Workspace) or add server-side auth checks in `doGet`/`doPost` using `Session.getActiveUser()`.
5. Click **Deploy** and copy the URL (`https://script.google.com/macros/s/…/exec`).

### 3 · Configure the frontend

1. Open the site and click the **⚙ gear icon** in the top-right.
2. Paste the Web App URL.
3. Uncheck *Modo demo*.
4. Click **Guardar configuración** and reload the page.

---

## AppScript API Reference

| Action | Method | Parameters |
|---|---|---|
| Get all notes | `GET ?action=getAll` | — |
| Get note by ID | `GET ?action=getById&id=NOTA-XXXXXXXX` | `id` |
| Create note | `POST` `{ action:"crear", titulo, contenido, responsable, citas:[] }` | — |
| Update note | `POST` `{ action:"actualizar", id, titulo, contenido, responsable, citas:[] }` | — |
| Delete note | `POST` `{ action:"eliminar", id }` | — |

All responses are JSON. Errors include an `error` string field.

---

## Note Data Model

```json
{
  "ID_Nota":          "NOTA-A1B2C3D4",
  "Título":           "Reunión de Planificación",
  "Contenido":        "<p>Contenido en <strong>HTML</strong>.</p>",
  "Fecha de Creación": "2026-03-15T12:00:00.000Z",
  "Responsable":      "Ana López",
  "Citas (IDs)":      "NOTA-XXXXXXXX, NOTA-YYYYYYYY",
  "citas":            ["NOTA-XXXXXXXX", "NOTA-YYYYYYYY"]
}
```

---

## Node Map Legend

| Color | Meaning |
|---|---|
| 🔵 Blue | Note that cites at least one other note |
| 🟣 Purple | Note that is cited but does not cite others |
| ⚪ Gray | Isolated note (no citations in either direction) |
| → Arrow | Direction of citation (from citing → to cited) |
