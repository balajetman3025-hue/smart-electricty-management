import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Booking, ExpenseRecord, PaymentRecord } from '../types';

function pdfCurrency(amount: number): string {
  return `INR ${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function downloadBookingInvoicePDF(booking: Booking) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(15, 23, 42); // Deep Navy
  doc.rect(0, 0, pageW, 38, 'F');

  doc.setTextColor(251, 191, 36); // Warm Gold
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('LuminaCraft', 16, 18);

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Electrical Decoration & Event Lighting Studio', 16, 25);
  doc.text('Pune · Mumbai · Jaipur  |  +91 98204 51100  |  hello@luminacraft.in', 16, 31);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TAX INVOICE / STATEMENT', pageW - 16, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Booking: ${booking.booking_code}`, pageW - 16, 27, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageW - 16, 33, { align: 'right' });

  // Customer & Event Details
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Billed To', 16, 50);
  doc.text('Event Details', 110, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(booking.customer_name, 16, 57);
  doc.text(`Mobile: ${booking.mobile_number}`, 16, 63);
  doc.text(`Status: ${booking.status}`, 16, 69);

  doc.text(`Service: ${booking.service_name || booking.event_type}`, 110, 57);
  doc.text(`Event Date: ${booking.event_date}`, 110, 63);
  const locLines = doc.splitTextToSize(`Venue: ${booking.event_location}`, 85);
  doc.text(locLines, 110, 69);

  // Line Items Table Header
  let y = 88;
  doc.setFillColor(241, 245, 249);
  doc.rect(16, y, pageW - 32, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Description', 20, y + 6);
  doc.text('Qty', 128, y + 6, { align: 'right' });
  doc.text('Rate', 156, y + 6, { align: 'right' });
  doc.text('Amount', pageW - 20, y + 6, { align: 'right' });
  y += 14;

  doc.setFont('helvetica', 'normal');
  const items =
    booking.quotation?.line_items && booking.quotation.line_items.length > 0
      ? booking.quotation.line_items
      : [
          {
            id: 'est',
            description: `${booking.service_name || booking.event_type} — ${booking.venue_size}`,
            quantity: 1,
            unit_price: booking.estimated_cost || booking.estimated_budget,
            total: booking.estimated_cost || booking.estimated_budget,
          },
        ];

  for (const item of items) {
    const descLines = doc.splitTextToSize(item.description, 95);
    doc.text(descLines, 20, y);
    doc.text(String(item.quantity), 128, y, { align: 'right' });
    doc.text(pdfCurrency(item.unit_price), 156, y, { align: 'right' });
    doc.text(pdfCurrency(item.total), pageW - 20, y, { align: 'right' });
    y += Math.max(8, descLines.length * 5 + 3);
    doc.setDrawColor(226, 232, 240);
    doc.line(16, y - 2, pageW - 16, y - 2);
  }

  // Summary Totals
  y += 6;
  const totalCost = booking.quotation ? booking.quotation.total_amount : booking.estimated_cost;
  const totalPaid = booking.total_paid || 0;
  const balance = Math.max(0, totalCost - totalPaid);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Total Quoted / Estimated:', 125, y);
  doc.text(pdfCurrency(totalCost), pageW - 20, y, { align: 'right' });

  y += 7;
  doc.text('Total Payments Received:', 125, y);
  doc.text(pdfCurrency(totalPaid), pageW - 20, y, { align: 'right' });

  y += 8;
  doc.setFillColor(15, 23, 42);
  doc.rect(120, y - 5, pageW - 136, 10, 'F');
  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.text('Remaining Balance:', 125, y + 1.5);
  doc.text(pdfCurrency(balance), pageW - 20, y + 1.5, { align: 'right' });

  // Payment History
  if (booking.payments && booking.payments.length > 0) {
    y += 18;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Payment Transactions', 16, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const p of booking.payments) {
      doc.text(
        `${p.payment_date}  |  ${p.payment_type}  |  ${p.payment_method}${p.reference_no ? ` (${p.reference_no})` : ''}`,
        16,
        y
      );
      doc.text(pdfCurrency(p.amount), pageW - 20, y, { align: 'right' });
      y += 6;
    }
  }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  doc.text('Thank you for choosing LuminaCraft Electrical & Event Lighting.', 16, 280);

  doc.save(`LuminaCraft-Invoice-${booking.booking_code}.pdf`);
}

export function downloadFinancialExcelReport(
  periodLabel: string,
  payments: PaymentRecord[],
  expenses: ExpenseRecord[]
) {
  const wb = XLSX.utils.book_new();

  const paymentRows = payments.map((p) => ({
    Date: p.payment_date,
    BookingCode: p.booking_code || p.booking_id,
    Customer: p.customer_name || '',
    Type: p.payment_type,
    Method: p.payment_method,
    Reference: p.reference_no || '',
    Amount_INR: Number(p.amount),
  }));

  const expenseRows = expenses.map((e) => ({
    Date: e.expense_date,
    Category: e.category,
    Description: e.description,
    Vendor: e.vendor,
    BookingCode: e.booking_code || '',
    Amount_INR: Number(e.amount),
  }));

  const totalRev = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const summaryRows = [
    { Metric: 'Report Period', Value: periodLabel },
    { Metric: 'Total Revenue (INR)', Value: totalRev },
    { Metric: 'Total Expenses (INR)', Value: totalExp },
    { Metric: 'Net Profit (INR)', Value: totalRev - totalExp },
    { Metric: 'Total Payment Transactions', Value: payments.length },
    { Metric: 'Total Expense Entries', Value: expenses.length },
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), 'Payments');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), 'Expenses');

  XLSX.writeFile(wb, `LuminaCraft-Financial-Report-${periodLabel.replace(/\s+/g, '-')}.xlsx`);
}

export function downloadFinancialPDFReport(
  periodLabel: string,
  payments: PaymentRecord[],
  expenses: ExpenseRecord[]
) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('LuminaCraft Financial Report', 16, 16);
  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`, 16, 24);

  const totalRev = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);

  let y = 44;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Revenue: ${pdfCurrency(totalRev)}    |    Expenses: ${pdfCurrency(totalExp)}    |    Net: ${pdfCurrency(totalRev - totalExp)}`, 16, y);

  y += 12;
  doc.setFontSize(10.5);
  doc.text('Payments Received', 16, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const p of payments.slice(0, 20)) {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${p.payment_date} · ${p.booking_code || ''} · ${p.customer_name || ''} (${p.payment_type})`, 16, y);
    doc.text(pdfCurrency(p.amount), pageW - 16, y, { align: 'right' });
    y += 6;
  }

  y += 8;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Recorded Expenses', 16, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const e of expenses.slice(0, 20)) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${e.expense_date} · ${e.category} · ${e.description.slice(0, 48)}`, 16, y);
    doc.text(pdfCurrency(e.amount), pageW - 16, y, { align: 'right' });
    y += 6;
  }

  doc.save(`LuminaCraft-Financial-Report-${periodLabel.replace(/\s+/g, '-')}.pdf`);
}
