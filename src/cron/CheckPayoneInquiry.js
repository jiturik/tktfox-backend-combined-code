import axios from "axios";
import moment from "moment";
import { createHash } from "crypto";
import { winstonLogger } from "../lib/winstonLogger.js";

export const CheckPayoneInquiry = async (reqbody) => {
  try {
    // Step 1: Fetch pending payments
    const existingPayments = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ pm_id: 2, is_booked: "N", recheck_payment: "Y" })
      .orderBy("pbd_id", "asc")
      .limit(10);

    if (!existingPayments.length) {
      console.log("No pending payments found.");
      return;
    }

    // Step 2: Fetch payment credentials
    const paymentCredentials = await PaymentCredentialFunction({
      org_id: 2,
      setting_key: "payone_payment",
    });

    if (paymentCredentials.false) {
      console.error("Invalid payment mode.");
      return;
    }

    const { MERCHANT_ID, URL, SECRET_KEY } = paymentCredentials.data;

    if (!MERCHANT_ID || !URL || !SECRET_KEY) {
      console.error("Missing payment credentials.");
      return;
    }

    for (const item of existingPayments) {
      try {
        // Step 3: Validate transaction expiration time
        const currentDateTimeFormatted = currentDateTime(
          null,
          "YYYY-MM-DD HH:mm",
        );
        const transactionExpiryTime = moment(item.created_at)
          .add(7, "minutes")
          .format("YYYY-MM-DD HH:mm");

        if (moment(transactionExpiryTime).isAfter(currentDateTimeFormatted)) {
          console.log(
            `Skipping reservation ID: ${item.reservation_id}, not eligible for retry.`,
          );
          continue;
        }

        // Step 4: Generate hash code
        const hashCodeString = `${SECRET_KEY}${MERCHANT_ID}2${item.payment_transaction_id}1.0`;
        const hashCode = createHash("sha256")
          .update(hashCodeString)
          .digest("hex");

        // Step 5: Make inquiry to payment gateway
        const response = await axios.post(
          `${URL}/SmartRoutePaymentWeb/SRMsgHandler`,
          null,
          {
            params: new URLSearchParams({
              OriginalTransactionID: item.payment_transaction_id,
              MerchantID: MERCHANT_ID,
              MessageID: "2",
              Version: "1.0",
              SecureHash: hashCode,
            }),
          },
        );

        if (response && response.data && response.status === 200) {
          const parsedData = response.data.split("&");

          // Step 6: Process response
          if (
            parsedData.includes("Response.GatewayStatusDescription=APPROVED") &&
            parsedData.includes("Response.StatusCode=00000")
          ) {
            console.log(
              `Payment approved for reservation ID: ${item.reservation_id}`,
            );
            const reservationDetails = await global
              .knexConnection("ms_reservation")
              .select(
                "ms_reservation.*",
                "ms_event.org_id",
                "ms_event.event_is_active",
              )
              .leftJoin(
                "ms_event",
                "ms_event.event_id",
                "ms_reservation.event_id",
              )
              .where({
                reservation_id: item.reservation_id,
                event_is_active: "Y",
                is_reserved: "Y",
              });

            if (!reservationDetails.length) {
              await global
                .knexConnection("ms_payment_booking_detail")
                .where({ reservation_id: item.reservation_id })
                .update({
                  recheck_payment: "N",
                  is_paid: "Y",
                  payment_capture:
                    "Seat got released when retried booking, please refund.",
                });
              continue;
            }

            await global
              .knexConnection("ms_payment_booking_detail")
              .where({ reservation_id: item.reservation_id })
              .update({
                is_booked: "Y",
                is_paid: "Y",
                recheck_payment: "N",
                payment_capture: JSON.stringify(response.data),
              });

            console.log(
              `Booking updated for reservation ID: ${item.reservation_id}`,
            );
          } else if (parsedData.includes("Response.StatusCode=00072")) {
            await global
              .knexConnection("ms_payment_booking_detail")
              .where({ reservation_id: item.reservation_id })
              .update({
                recheck_payment: "Y",
                payment_capture: JSON.stringify(response.data),
              });
            console.log(
              `Payment recheck required for reservation ID: ${item.reservation_id}`,
            );
          } else {
            await global
              .knexConnection("ms_payment_booking_detail")
              .where({ reservation_id: item.reservation_id })
              .update({
                recheck_payment: "N",
                payment_capture: JSON.stringify(response.data),
              });
            console.log(
              `Payment failed for reservation ID: ${item.reservation_id}`,
            );
          }
        } else {
          await global
            .knexConnection("ms_payment_booking_detail")
            .where({ reservation_id: item.reservation_id })
            .update({
              payment_capture: "No response from payment gateway",
            });
          console.error(
            `No response from gateway for reservation ID: ${item.reservation_id}`,
          );
        }
      } catch (innerError) {
        winstonLogger.error("Error in CheckPayoneInquiry 1:", error);
        console.error(
          `Error processing reservation ID: ${item.reservation_id}`,
          innerError,
        );
      }
    }
  } catch (error) {
    winstonLogger.error("Error in CheckPayoneInquiry 2:", error);
    console.error("Error in CheckPayoneInquiry:", error);
  }
};
