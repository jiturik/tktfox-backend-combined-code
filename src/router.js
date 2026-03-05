import { Router } from "express";

import { LoginRoutes } from "./modules/Login/LoginRoutes.js";

import { CinemaRoutes } from "./modules/Cinema/CinemaRoutes.js";
import { CustomerRoutes } from "./modules/Customer/CustomerRoutes.js";
import { EventRoutes } from "./modules/Event/EventRoutes.js";
import { ScannerRoutes } from "./modules/EventScanner/ScannerRoutes.js";
import { GuestRoutes } from "./modules/Guest/GuestRoutes.js";
import { MasterRoutes } from "./modules/Master/MasterRoutes.js";
import { PassRoutes } from "./modules/MovieEventPass/PassRoutes.js";
import { ReportRoutes } from "./modules/Report/ReportRoutes.js";
import { UserRoutes } from "./modules/User/UserRoutes.js";
import { WebsiteRoutes } from "./modules/Website/WebsiteRoutes.js";
import { PaymentAndBookingRoutes } from "./modules/PaymentAndBooking/PaymentAndBookingRoutes.js";
import { ShopRoutes } from "./modules/Shop/ShopRoutes.js";

// Define all admin routes in an array
const adminRoutes = [
  UserRoutes,
  CustomerRoutes,
  GuestRoutes,
  MasterRoutes,
  CinemaRoutes,
  EventRoutes,
  ReportRoutes,
  PassRoutes,
  ShopRoutes,
];
const router = Router();

export function RootRouter() {
  // load all the routes of the modules here

  router.use("/", LoginRoutes());

  // Register all admin routes
  adminRoutes.forEach((route) => {
    router.use("/admin", route());
  });

  // Register all website routes
  router.use("/api", WebsiteRoutes());
  router.use("/shop", ShopRoutes());

  // Register all payments routes
  router.use("/payment", PaymentAndBookingRoutes());

  //Register all scanner app routes
  router.use("/scanner", ScannerRoutes());

  return router;
}
