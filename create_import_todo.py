#!/usr/bin/env python3
"""Import TODO List Generator for Web2Wireframe"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime

wb = Workbook()

# Colors
HEADER_FILL = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
P0_FILL = PatternFill(start_color="FF6B6B", end_color="FF6B6B", fill_type="solid")
P1_FILL = PatternFill(start_color="FFB347", end_color="FFB347", fill_type="solid")
P2_FILL = PatternFill(start_color="77DD77", end_color="77DD77", fill_type="solid")
HEADER_FONT = Font(bold=True, color="FFFFFF")
BOLD = Font(bold=True)
THIN_BORDER = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)

def style_header(ws, row=1):
    for cell in ws[row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        cell.border = THIN_BORDER

def auto_width(ws):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            try:
                if len(str(cell.value)) > max_len:
                    max_len = len(str(cell.value))
            except:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 2, 50)

# ==================== Sheet 1: TODO List ====================
ws1 = wb.active
ws1.title = "Import TODO"
ws1.append(["პრიორიტეტი", "კატეგორია", "დავალება", "აღწერა", "სტატუსი", "საათები", "დამოკიდებულება", "შენიშვნა"])
style_header(ws1)

todos = [
    # Plugin Frontend - P0
    ("P0", "Plugin Frontend", "Frame Selection UI", "მომხმარებლის მიერ frame-ების არჩევა", "არ დაწყებულა", 4, "-", "figma.currentPage.selection"),
    ("P0", "Plugin Frontend", "Import ღილაკი", "UI ელემენტი import-ის დასაწყებად", "არ დაწყებულა", 2, "-", ""),
    ("P0", "Plugin Frontend", "პროგრესის ინდიკატორი", "import-ის მიმდინარეობის ჩვენება", "არ დაწყებულა", 3, "Import ღილაკი", ""),
    ("P1", "Plugin Frontend", "Preview კომპონენტი", "არჩეული frame-ის preview", "არ დაწყებულა", 4, "Frame Selection", ""),
    ("P1", "Plugin Frontend", "შეცდომების UI", "შეცდომების გამოტანა", "არ დაწყებულა", 3, "-", ""),
    ("P1", "Plugin Frontend", "Import Settings Panel", "import-ის პარამეტრები", "არ დაწყებულა", 4, "-", ""),
    ("P2", "Plugin Frontend", "Batch Import UI", "რამდენიმე frame-ის ერთდროულად import", "არ დაწყებულა", 5, "Frame Selection", ""),
    ("P2", "Plugin Frontend", "Import History", "წარსული import-ების ჩვენება", "არ დაწყებულა", 4, "API: GET imports", ""),

    # Plugin Backend - P0
    ("P0", "Plugin Backend", "Frame Data Extraction", "frame-ის properties-ების ამოღება", "არ დაწყებულა", 6, "-", "width, height, position, name"),
    ("P0", "Plugin Backend", "Text Node Parsing", "ტექსტის და სტილების ამოღება", "არ დაწყებულა", 8, "Frame Extraction", "TextNode traverse"),
    ("P0", "Plugin Backend", "Shape Layer Parsing", "rectangles, vectors, ellipses", "არ დაწყებულა", 8, "Frame Extraction", ""),
    ("P0", "Plugin Backend", "Image Export", "სურათების exportAsync()", "არ დაწყებულა", 6, "Frame Extraction", "PNG/SVG format"),
    ("P0", "Plugin Backend", "Color Extraction", "fill, stroke colors", "არ დაწყებულა", 4, "-", "RGBA → HEX"),
    ("P0", "Plugin Backend", "Typography Extraction", "fonts, sizes, weights", "არ დაწყებულა", 4, "Text Parsing", ""),
    ("P0", "Plugin Backend", "Layout/Spacing", "auto-layout, padding, gaps", "არ დაწყებულა", 6, "Frame Extraction", ""),
    ("P0", "Plugin Backend", "JSON Structure Builder", "მონაცემების ორგანიზება", "არ დაწყებულა", 4, "ყველა Extraction", ""),
    ("P1", "Plugin Backend", "Nested Components", "შიდა კომპონენტების დამუშავება", "არ დაწყებულა", 6, "Frame Extraction", "recursive"),
    ("P1", "Plugin Backend", "Effects Parsing", "shadows, blurs", "არ დაწყებულა", 4, "-", ""),
    ("P1", "Plugin Backend", "Constraints", "responsive behavior", "არ დაწყებულა", 4, "-", ""),
    ("P1", "Plugin Backend", "Error Handling", "unsupported elements", "არ დაწყებულა", 4, "-", ""),

    # API - P0
    ("P0", "API", "POST /api/plugin/import", "frame data მიღება და შენახვა", "არ დაწყებულა", 4, "DB Schema", ""),
    ("P0", "API", "Authentication Middleware", "API key validation", "არ დაწყებულა", 3, "-", ""),
    ("P0", "API", "Request Validation", "Zod schema for import data", "არ დაწყებულა", 3, "-", ""),
    ("P0", "API", "Database Save", "import-ის შენახვა MongoDB-ში", "არ დაწყებულა", 4, "Schema", ""),
    ("P1", "API", "GET /api/plugin/imports", "import-ების სია", "არ დაწყებულა", 3, "POST endpoint", "pagination"),
    ("P1", "API", "GET /api/plugin/import/:id", "კონკრეტული import", "არ დაწყებულა", 2, "POST endpoint", ""),
    ("P1", "API", "DELETE /api/plugin/import/:id", "import-ის წაშლა", "არ დაწყებულა", 2, "POST endpoint", "soft delete"),
    ("P1", "API", "Rate Limiting", "request-ების ლიმიტი", "არ დაწყებულა", 3, "-", ""),

    # Database - P0
    ("P0", "Database", "Imports Schema Design", "MongoDB schema დიზაინი", "არ დაწყებულა", 2, "-", "userId, frameData, metadata"),
    ("P0", "Database", "Indexes", "userId, createdAt indexes", "არ დაწყებულა", 2, "Schema", ""),
    ("P1", "Database", "Metadata Fields", "tags, categories, version", "არ დაწყებულა", 2, "Schema", ""),

    # Testing - P0
    ("P0", "Testing", "Unit: Frame Extraction", "extraction ფუნქციების ტესტები", "არ დაწყებულა", 4, "Extraction code", ""),
    ("P0", "Testing", "Unit: Data Parsing", "parsing ლოგიკის ტესტები", "არ დაწყებულა", 4, "Parsing code", ""),
    ("P0", "Testing", "Integration: Full Flow", "მთლიანი flow-ს ტესტი", "არ დაწყებულა", 6, "API + Backend", ""),
    ("P1", "Testing", "Error Scenarios", "შეცდომების ტესტირება", "არ დაწყებულა", 4, "-", ""),
    ("P1", "Testing", "Performance Test", "დიდ frame-ებზე ტესტი", "არ დაწყებულა", 4, "Full Flow", ""),

    # Documentation - P1
    ("P1", "Documentation", "API Docs", "endpoint-ების დოკუმენტაცია", "არ დაწყებულა", 3, "API endpoints", ""),
    ("P1", "Documentation", "Usage Guide", "გამოყენების ინსტრუქცია", "არ დაწყებულა", 3, "-", ""),
]

for todo in todos:
    ws1.append(todo)
    row = ws1.max_row
    # Priority color
    if todo[0] == "P0":
        ws1.cell(row, 1).fill = P0_FILL
    elif todo[0] == "P1":
        ws1.cell(row, 1).fill = P1_FILL
    elif todo[0] == "P2":
        ws1.cell(row, 1).fill = P2_FILL
    for col in range(1, 9):
        ws1.cell(row, col).border = THIN_BORDER

auto_width(ws1)

# ==================== Sheet 2: API Endpoints ====================
ws2 = wb.create_sheet("API Endpoints")
ws2.append(["Endpoint", "Method", "Request Body", "Response", "სტატუსი"])
style_header(ws2)

endpoints = [
    ("/api/plugin/import", "POST", "{ frameData, fileName, fileId }", "{ success, importId }", "დაგეგმილი"),
    ("/api/plugin/imports", "GET", "?page=1&limit=20", "{ imports[], total }", "დაგეგმილი"),
    ("/api/plugin/import/:id", "GET", "-", "{ import }", "დაგეგმილი"),
    ("/api/plugin/import/:id", "DELETE", "-", "{ success }", "დაგეგმილი"),
]

for ep in endpoints:
    ws2.append(ep)
    for col in range(1, 6):
        ws2.cell(ws2.max_row, col).border = THIN_BORDER

auto_width(ws2)

# ==================== Sheet 3: Database Schema ====================
ws3 = wb.create_sheet("Database Schema")
ws3.append(["Collection", "Field", "Type", "Required", "Description"])
style_header(ws3)

schema = [
    ("imports", "_id", "ObjectId", "auto", "უნიკალური ID"),
    ("imports", "userId", "ObjectId", "დიახ", "მომხმარებლის ID (index)"),
    ("imports", "name", "String", "დიახ", "import-ის სახელი"),
    ("imports", "figmaFileId", "String", "დიახ", "Figma ფაილის ID"),
    ("imports", "figmaFileName", "String", "არა", "ფაილის სახელი"),
    ("imports", "frameData", "Object", "დიახ", "ამოღებული მონაცემები (JSON)"),
    ("imports", "frameData.nodes", "Array", "დიახ", "ელემენტების მასივი"),
    ("imports", "frameData.colors", "Array", "არა", "ფერების პალიტრა"),
    ("imports", "frameData.typography", "Array", "არა", "ფონტების სია"),
    ("imports", "thumbnail", "String", "არა", "preview სურათი (base64)"),
    ("imports", "tags", "Array<String>", "არა", "თეგები"),
    ("imports", "createdAt", "Date", "auto", "შექმნის თარიღი (index)"),
    ("imports", "updatedAt", "Date", "auto", "განახლების თარიღი"),
    ("imports", "deletedAt", "Date", "არა", "soft delete"),
]

for s in schema:
    ws3.append(s)
    for col in range(1, 6):
        ws3.cell(ws3.max_row, col).border = THIN_BORDER

auto_width(ws3)

# ==================== Sheet 4: Timeline ====================
ws4 = wb.create_sheet("Timeline")
ws4.append(["კვირა", "დავალებები", "შედეგი"])
style_header(ws4)

timeline = [
    ("კვირა 1", "DB Schema, API POST endpoint, Frame Extraction", "ძირითადი ინფრასტრუქტურა"),
    ("კვირა 2", "Text/Shape/Image Parsing, Color/Typography Extraction", "მონაცემების ამოღება"),
    ("კვირა 3", "Plugin UI (Selection, Button, Progress), JSON Builder", "UI და ინტეგრაცია"),
    ("კვირა 4", "GET/DELETE endpoints, Error Handling, Testing", "API სრული + ტესტები"),
    ("კვირა 5", "Preview, History, Settings Panel, Performance", "დამატებითი ფუნქციები"),
    ("კვირა 6", "Documentation, Bug fixes, Polish", "დასრულება"),
]

for t in timeline:
    ws4.append(t)
    for col in range(1, 4):
        ws4.cell(ws4.max_row, col).border = THIN_BORDER

auto_width(ws4)

# ==================== Sheet 5: Summary ====================
ws5 = wb.create_sheet("Summary")
ws5.append(["მეტრიკა", "მნიშვნელობა"])
style_header(ws5)

p0_count = len([t for t in todos if t[0] == "P0"])
p1_count = len([t for t in todos if t[0] == "P1"])
p2_count = len([t for t in todos if t[0] == "P2"])
total_hours = sum([t[5] for t in todos])

summary = [
    ("სულ დავალებები", len(todos)),
    ("P0 (კრიტიკული)", p0_count),
    ("P1 (მაღალი)", p1_count),
    ("P2 (საშუალო)", p2_count),
    ("სულ საათები", total_hours),
    ("კვირები (40სთ/კვ)", f"{total_hours / 40:.1f}"),
    ("რეკომენდებული ვადა", "6 კვირა"),
]

for s in summary:
    ws5.append(s)
    ws5.cell(ws5.max_row, 1).font = BOLD
    for col in range(1, 3):
        ws5.cell(ws5.max_row, col).border = THIN_BORDER

auto_width(ws5)

# კატეგორიების breakdown
ws5.append([])
ws5.append(["კატეგორია", "დავალებები", "საათები"])
style_header(ws5, ws5.max_row)

categories = {}
for t in todos:
    cat = t[1]
    if cat not in categories:
        categories[cat] = {"count": 0, "hours": 0}
    categories[cat]["count"] += 1
    categories[cat]["hours"] += t[5]

for cat, data in categories.items():
    ws5.append([cat, data["count"], data["hours"]])
    for col in range(1, 4):
        ws5.cell(ws5.max_row, col).border = THIN_BORDER

# Save
filename = f"WEB2WIREFRAME_Import_TODO_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
wb.save(filename)
print(f"შექმნილია: {filename}")
print(f"სულ: {len(todos)} დავალება, {total_hours} საათი")
