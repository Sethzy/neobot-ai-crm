/**
 * Script to generate test PDF fixtures.
 * Run with: npx tsx tests/fixtures/create-test-pdf.ts
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFileSync } from "fs";

async function createTestPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 5; i++) {
    const page = doc.addPage([612, 792]); // Letter size
    page.drawText(`Page ${i}`, {
      x: 50,
      y: 700,
      size: 48,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await doc.save();
  writeFileSync("tests/fixtures/5-page-test.pdf", bytes);
  console.log("Created tests/fixtures/5-page-test.pdf");
}

createTestPdf();
