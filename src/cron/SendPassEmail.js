import ejs from "ejs";
import moment from "moment";
import fs from "fs";
import path from "path";
import { sendEmail } from "../lib/helper.js";
import { winstonLogger } from "../lib/winstonLogger.js";

export const SendPassEmail = async (reqbody) => {
  const passBookingId = reqbody?.pass_booking_id || null;
  const resendCustomerEmail = reqbody?.resend_customer_email || null;

  try {
    // Fetch pass booking data
    const bookingList = await global
      .knexConnection("pass_booking")
      .select("pass_booking.*", "movie_event_pass.pass_email_content")
      .join(
        "movie_event_pass",
        "movie_event_pass.pass_id",
        "pass_booking.pass_id"
      )
      .where((builder) => {
        if (passBookingId) {
          builder.where("pass_booking.pass_booking_id", passBookingId);
        } else {
          builder.where("pass_booking.email_sent", "N");
        }
      })
      .orderBy("pass_booking.pass_booking_id", "asc")
      .limit(5);

    if (!bookingList.length) {
      console.log("No email to be sent.");
      return false;
    }

    for (const booking of bookingList) {
      // Update email sent status
      await global
        .knexConnection("pass_booking")
        .where({ pass_booking_id: booking.pass_booking_id })
        .update({ email_sent: "Y" });

      const emailData = {
        pass_booking_id: booking.pass_booking_id,
        booking_date_time: moment(booking.booking_date_time).format(
          "DD/MM/YYYY hh:mm:ss"
        ),
        pass_name: booking.pass_name,
        customer_email: resendCustomerEmail || booking.c_email,
        c_name: booking.c_name,
        c_phone_number: `${booking.c_country_code}${booking.c_phone_number}`,
        pass_valid_days: booking.pass_valid_days,
        pass_validity_to: moment()
          .add(booking.pass_valid_days, "days")
          .format("DD/MM/YYYY"),
        payment_transaction_id: booking.payment_transaction_id,
        pass_total_price: booking.pass_total_price,
        currency: booking.currency,
        pass_email_content: booking.pass_email_content,
      };

      await sendPassEmail(emailData);
    }
  } catch (error) {
    winstonLogger.error("Error in SendPassEmail 1:", error);
    console.error("Error in SendPassEmail:", error);
  }
};

const sendPassEmail = async (emailData) => {
  try {
    const templatePath = path.join(
      global.__base,
      "/modules/templetes/PassEmail.ejs"
    );
    const emailTemplate = fs.readFileSync(templatePath, "utf8");

    const emailHtml = await ejs.render(emailTemplate, { emailData });

    await sendEmail(
      emailData.customer_email,
      `Welcome to ${process.env.CLIENT_NAME} Movie Pass!`,
      emailHtml,
      null // No attachments for this email
    );
  } catch (error) {
    console.error("Error in sending email:", error);
    // Revert email status on failure
    await global
      .knexConnection("pass_booking")
      .where({ pass_booking_id: emailData.pass_booking_id })
      .update({ email_sent: "N" });
    winstonLogger.error("Error in SendPassEmail 2:", error);
  }
};
