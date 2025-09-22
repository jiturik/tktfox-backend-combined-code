import moment from 'moment';
import { w as winstonLogger } from './server.js';
import 'http';
import 'express';
import 'cors';
import 'body-parser';
import 'helmet';
import 'jwt-decode';
import 'jsonwebtoken';
import 'winston';
import 'path';
import 'fs';
import 'uuid';
import 'bcryptjs';
import 'nodemailer';
import 'moment-timezone';
import 'lodash';
import 'node-cache';
import 'zlib';
import 'multer';
import 'exceljs';
import 'ejs';
import 'html-pdf';
import 'qrcode';
import 'puppeteer';
import 'seatsio';
import 'util';
import 'archiver';
import 'crypto';
import 'axios';
import 'url';
import './knex/knex.js';
import 'knex';
import 'knex-paginate';
import 'dotenv';
import 'ioredis';

const CheckReleaseSeats = async (reqbody) => {
  try {
    // Fetch all active reserved data
    const activeReservations = await global
      .knexConnection("ms_reservation")
      .select("r_id", "created_at", "seat_release_time", "timezone_name")
      .where({
        is_reserved: "Y",
        is_booked: "N",
      })
      .groupBy("r_id");

    if (!activeReservations.length) {
      console.log("No active reservations found.");
      return;
    }

    const releaseSeatIds = [];
    const formatName = "YYYY-MM-DD HH:mm";

    for (const reservation of activeReservations) {
      try {
        // Get current time in the specified timezone
        const currentDateTime = moment()
          .tz(reservation.timezone_name)
          .format(formatName);

        // Calculate seat release time
        const releaseDateTime = moment(reservation.created_at)
          .add(reservation.seat_release_time || 15, "minutes")
          .format(formatName);

        // Check if the release time has passed
        if (moment(releaseDateTime).isBefore(currentDateTime)) {
          releaseSeatIds.push(reservation.r_id);
        }
      } catch (innerError) {
        winstonLogger.error("Error in CheckReleaseSeats 1:", error);
        console.error(
          `Error processing reservation ID: ${reservation.r_id}`,
          innerError
        );
      }
    }

    if (releaseSeatIds.length) {
      // Update reservations to mark seats as released
      await global
        .knexConnection("ms_reservation")
        .update({ is_reserved: "N" })
        .whereIn("r_id", releaseSeatIds);

      console.log("Seats released:", releaseSeatIds);
    } else {
      console.log("No seats to release.");
    }
  } catch (error) {
    winstonLogger.error("Error in CheckReleaseSeats 2:", error);
    console.error("Error in CheckReleaseSeats:", error);
  }
};

export { CheckReleaseSeats };
