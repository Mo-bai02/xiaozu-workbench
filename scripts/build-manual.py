# -*- coding: utf-8 -*-
"""Markdown → Word（使用说明）。改内容后重新跑一遍即可。"""
import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(r"C:\Users\Mobai\Documents\deepseek-harness\default-workspace\ai-console")
SRC = ROOT / "docs/使用说明.md"
OUT = ROOT / "docs/小组工作台 使用说明.docx"

FONT = "微软雅黑"
MONO = "Consolas"
ACCENT = RGBColor(0x3B, 0x6E, 0xF6)
MUTED = RGBColor(0x5B, 0x64, 0x72)
WIDTH = Cm(14.5)


def set_font(run, size=10.5, bold=None, color=None, name=FONT):
    run.font.name = name
    run.font.size = Pt(size)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def shade(paragraph, fill):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    p_pr.append(shd)


def border(paragraph, color="E5A23B"):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    for side in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "8")
        el.set(qn("w:color"), color)
        borders.append(el)
    p_pr.append(borders)


def add_picture(doc, path, caption=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(path), width=WIDTH)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    if caption:
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_font(cap.add_run(caption), size=9, color=MUTED)


INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")


def add_inline(paragraph, text, size=10.5):
    for chunk in INLINE.split(text):
        if not chunk:
            continue
        if chunk.startswith("**") and chunk.endswith("**"):
            set_font(paragraph.add_run(chunk[2:-2]), size=size, bold=True)
        elif chunk.startswith("`") and chunk.endswith("`"):
            set_font(paragraph.add_run(chunk[1:-1]), name=MONO, size=size - 0.5, color=RGBColor(0xC7, 0x25, 0x4E))
        elif chunk.startswith("[") and "](" in chunk:
            label, url = re.match(r"\[([^\]]+)\]\(([^)]+)\)", chunk).groups()
            set_font(paragraph.add_run(label), size=size, color=None if url.startswith("#") else ACCENT)
        else:
            set_font(paragraph.add_run(chunk), size=size)


lines = SRC.read_text(encoding="utf-8").splitlines()
doc = Document()

section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.left_margin = section.right_margin = Cm(2.5)
section.top_margin = section.bottom_margin = Cm(2.2)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.paragraph_format.line_spacing = 1.45
normal.paragraph_format.space_after = Pt(4)

for level, size in ((1, 17), (2, 13), (3, 11.5)):
    style = doc.styles[f"Heading {level}"]
    style.font.name = FONT
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = ACCENT if level == 1 else RGBColor(0x1F, 0x24, 0x2C)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    style.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    style.paragraph_format.space_after = Pt(5)

i, total = 0, len(lines)
numbered = [0, False]
first_section = True
in_toc = False

while i < total:
    line = lines[i].strip()

    if not re.match(r"^\d+\.\s", line):
        numbered[1] = False

    if not line:
        i += 1
        continue

    if line.startswith("```"):
        i += 1
        block = []
        while i < total and not lines[i].strip().startswith("```"):
            block.append(lines[i])
            i += 1
        i += 1
        p = doc.add_paragraph()
        shade(p, "F5F7FA")
        p.paragraph_format.left_indent = Cm(0.4)
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(6)
        set_font(p.add_run("\n".join(block)), name=MONO, size=9)
        continue

    if line.startswith("|") and i + 1 < total and set(lines[i + 1].strip()) <= set("|-: "):
        header = [c.strip() for c in line.strip("|").split("|")]
        i += 2
        rows = []
        while i < total and lines[i].strip().startswith("|"):
            rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
            i += 1
        table = doc.add_table(rows=1, cols=len(header))
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        for index, title in enumerate(header):
            cell = table.rows[0].cells[index]
            cell.text = ""
            add_inline(cell.paragraphs[0], title, size=9.5)
            for run in cell.paragraphs[0].runs:
                run.bold = True
        for row in rows:
            cells = table.add_row().cells
            for index, value in enumerate(row[: len(header)]):
                cells[index].text = ""
                add_inline(cells[index].paragraphs[0], value, size=9.5)
        doc.add_paragraph()
        continue

    match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
    if match:
        add_picture(doc, (SRC.parent / match.group(2)).resolve(), caption=match.group(1))
        i += 1
        continue

    if line == "<p>":
        i += 1
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        while i < total and lines[i].strip() != "</p>":
            for tag in re.finditer(r"<img[^>]*>", lines[i]):
                src = re.search(r'src="([^"]+)"', tag.group(0))
                if src:
                    p.add_run().add_picture(str((SRC.parent / src.group(1)).resolve()), width=Cm(6.6))
                    p.add_run("   ")
            i += 1
        i += 1
        continue

    if line in ("</p>", "---"):
        i += 1
        continue

    if line.startswith("# "):
        p = doc.add_paragraph()
        set_font(p.add_run(line[2:]), size=24, bold=True, color=ACCENT)
        p.paragraph_format.space_after = Pt(10)
        i += 1
        continue

    if line.startswith("## "):
        title = line[3:]
        if title == "目录":
            in_toc = True
            doc.add_heading(title, level=1)
            i += 1
            continue
        in_toc = False
        if not first_section:
            doc.add_page_break()
        first_section = False
        doc.add_heading(title, level=1)
        i += 1
        continue

    if line.startswith("### "):
        doc.add_heading(line[4:], level=2)
        i += 1
        continue

    if line.startswith("- "):
        p = doc.add_paragraph(style="List Bullet")
        add_inline(p, line[2:], size=10.5 if not in_toc else 10)
        p.paragraph_format.space_after = Pt(1 if in_toc else 2)
        i += 1
        continue

    if re.match(r"^\d+\.\s", line):
        body_text = re.sub(r"^\d+\.\s", "", line)
        if in_toc:
            p = doc.add_paragraph(style="List Number")
            add_inline(p, body_text, size=10)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.15
        else:
            numbered[0] = numbered[0] + 1 if numbered[1] else 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.7)
            p.paragraph_format.first_line_indent = Cm(-0.7)
            p.paragraph_format.space_after = Pt(2)
            set_font(p.add_run(f"{numbered[0]}. "), size=10.5, bold=True)
            add_inline(p, body_text, size=10.5)
        numbered[1] = True
        i += 1
        continue

    if line.startswith(">"):
        p = doc.add_paragraph()
        shade(p, "FFF4E5")
        border(p)
        p.paragraph_format.left_indent = Cm(0.2)
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(8)
        add_inline(p, line.lstrip("> ").strip(), size=10)
        i += 1
        continue

    add_inline(doc.add_paragraph(), line)
    i += 1

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = footer.add_run()
set_font(run, size=9, color=MUTED)
begin = OxmlElement("w:fldChar")
begin.set(qn("w:fldCharType"), "begin")
instr = OxmlElement("w:instrText")
instr.set(qn("xml:space"), "preserve")
instr.text = " PAGE "
end = OxmlElement("w:fldChar")
end.set(qn("w:fldCharType"), "end")
run._r.append(begin)
run._r.append(instr)
run._r.append(end)

doc.save(OUT)
print("saved:", OUT)
