import ejs from "ejs";
import moment from "moment";
import pdf from "html-pdf";
import fs from "fs";
import path from "path";
import { createQRCode } from "../lib/QrcodeGenerator.js";
import { sendEmail } from "../lib/helper.js";
import { winstonLogger } from "../lib/winstonLogger.js";
import puppeteer from "puppeteer";

export const CreateInvSendTicketEmail = async (reqbody) => {
  const BOOKINGID = reqbody?.booking_id || null;
  const resendCustomerEmail = reqbody?.resend_customer_email || null;

  try {
    // Fetch booking data
    const bookingList = await global
      .knexConnection("ms_booking")
      .select(
        "ms_booking.*",
        "ms_event.event_tnc",
        "ms_event.event_seating_type",
        "ms_payment_booking_detail.success_frontend_url"
      )
      .join("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .join(
        "ms_payment_booking_detail",
        "ms_payment_booking_detail.reservation_id",
        "ms_booking.reservation_id"
      )
      .where((builder) => {
        if (BOOKINGID) {
          builder.where("ms_booking.booking_id", BOOKINGID);
        } else {
          builder.where("ms_booking.ticket_sent", "N");
        }
      })
      .orderBy("booking_id", "asc")
      .limit(5);

    if (!bookingList.length) {
      console.log("No invoices or tickets to be sent.");
      return;
    }

    for (const booking of bookingList) {
      try {
        await global
          .knexConnection("ms_booking")
          .where({ booking_id: booking.booking_id })
          .update({ ticket_sent: "Y" });

        // Generate QR code
        const qrUrl = `${booking.success_frontend_url}/${booking.booking_code}`;
        let qrImage = "";
        const qrcodeData = await createQRCode(qrUrl, "buffer")
          .then((qrcode) => {
            qrImage = qrcode;
            console.log("QR Code generated:", booking.booking_code);
          })
          .catch((error) => {
            winstonLogger.error("Error in CreateInvSendTicketEmail 1:", error);
            console.error("error in qr generation", error.message);
          });

        // Prepare email data
        const emailData = {
          booking_id: booking.booking_id,
          booking_code: booking.booking_code,
          booking_date_time: moment(booking.booking_date_time).format(
            "DD/MM/YYYY hh:mm:ss"
          ),
          event_name: booking.event_name,
          event_tnc: booking.event_tnc,
          customer_email: resendCustomerEmail || booking.c_email,
          c_name: booking.c_name,
          c_phone_number: `${booking.c_country_code}${booking.c_phone_number}`,
          cinema_name: booking.cinema_name,
          city_name: booking.city_name,
          country_name: booking.country_name,
          event_date_time: `${moment(booking.event_date).format(
            "DD/MM/YYYY"
          )} ${booking.event_time}`,
          event_date_body: moment(booking.event_date).format("DD/MM/YYYY"),
          event_time_body: booking.event_time,
          seats: booking.seat_names,
          totalPrice: booking.total_price,
          currency: booking.currency,
          qrcode_data: qrImage,
          event_seating_type: booking.event_seating_type,
          attachments: [],
          client_name: process.env.CLIENT_NAME || "Our Platform",
          invoice_content:
            process.env.CLIENT_NAME && process.env.CLIENT_NAME == "TKTFOX"
              ? " and invoice "
              : " ",
        };

        // Create invoice and ticket PDFs
        const createInvResponse = await createInvoicePdf(emailData);
        if (createInvResponse.status) {
          // Attach PDFs to the email
          for (const file of createInvResponse.data) {
            const fileData = fs.readFileSync(file.path);
            emailData.attachments.push({
              filename: file.name,
              content: fileData,
              cid: "",
            });
          }
          // Send email
          await sendTicketEmail(emailData);
        } else {
          await global
            .knexConnection("ms_booking")
            .where({ booking_id: booking.booking_id })
            .update({ ticket_sent: "N" });
        }
      } catch (error) {
        winstonLogger.error("Error in CreateInvSendTicketEmail 2:", error);
        console.error(
          "Error processing booking:",
          booking.booking_code,
          "==",
          error
        );
        // Continue to the next iteration if an error occurs
        continue;
      }
    }
  } catch (error) {
    winstonLogger.error("Error in CreateInvSendTicketEmail 3:", error);
    console.error("Error in CreateInvSendTicketEmail:", error);
  }
};

const sendTicketEmail = async (emailData) => {
  try {
    const templatePath = path.join(
      global.__base,
      "/modules/templetes/ticketBody.ejs"
    );
    const ticketTemplate = fs.readFileSync(templatePath, "utf8");

    const emailHtml = await ejs.render(ticketTemplate, { emailData });
    const attachments = emailData.attachments || [];

    await sendEmail(
      emailData.customer_email,
      `${process.env.CLIENT_NAME} -: ${emailData.booking_code} - ${emailData.event_name}`,
      emailHtml,
      attachments
    );
  } catch (error) {
    console.error("Error in sending email:", error);
    await global
      .knexConnection("ms_booking")
      .where({ booking_id: emailData.booking_id })
      .update({ ticket_sent: "N" });
    winstonLogger.error("Error in sendTicketEmail 4:", error);
  }
};

const getSeatsArray = async (seats) => {
  const updatedSeats = [];
  for (const seat of seats) {
    const [row, count] = seat.split("-");
    for (let s = 1; s <= parseInt(count); s++) {
      updatedSeats.push(`${row} (Customer ${s})`);
    }
  }
  return updatedSeats;
};

const createInvoicePdf = async (emailData) => {
  let pdfArray = [];

  return new Promise(async (resolve, reject) => {
    if (!emailData.seats) {
      return reject({
        status: false,
        message: "Seats data is missing",
      });
    }

    let seatsArray = emailData.seats.split(",");
    if (emailData.event_seating_type === "N") {
      seatsArray = await getSeatsArray(seatsArray);
    } else if (emailData.event_seating_type === "seats_io") {
      if (seatsArray[0].split("-")[0] === "GA") {
        seatsArray = await getSeatsArray(seatsArray);
      }
    }
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", // fixes memory issues
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000); // 60 sec timeout instead of 30
      page.setDefaultTimeout(60000);

      for (const seat of seatsArray) {
        emailData.seats = seat;

        const templatePath =
          seat === "INV"
            ? path.join(global.__base, "/modules/templetes/ticketInvoice.ejs")
            : path.join(global.__base, "/modules/templetes/confirmTicket.ejs");

        const invoiceTemplate = fs.readFileSync(templatePath, "utf8");
        const invHtml = await ejs.render(invoiceTemplate, { emailData });

        const options = {
          format: "A4",
          landscape: false,
          printBackground: true,
        };

        const fileName = `${emailData.booking_code}-${seat}.pdf`;
        const filePath = path.join(
          global.__base,
          "/public/uploads/ticketInvoice",
          fileName
        );

        if (!fs.existsSync(path.dirname(filePath))) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }

        await page.setContent(invHtml, {
          waitUntil: "domcontentloaded",
          timeout: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const pdfBuffer = await page.pdf(options);
        fs.writeFileSync(filePath, pdfBuffer);

        pdfArray.push({ name: fileName, path: filePath });
      }

      console.log("PDFs created");
      await browser.close();
      return resolve({
        status: true,
        message: "PDFs created",
        data: pdfArray,
      });
    } catch (err) {
      console.error("Error in createInvoicePdf fn", err);
      reject({ status: false, message: "Error in createInvoicePdf" });
    }
  });
};
