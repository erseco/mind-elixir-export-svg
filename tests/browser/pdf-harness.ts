// Bundled by scripts/build-harness.mjs for the PDF compatibility test only.
import { jsPDF } from "jspdf";
import "svg2pdf.js";

Object.assign(window, { pdf: { jsPDF } });
