import { CronJob } from "cron";

const cronRun = {
  isCreateInvSendTicketEmail: true,
  isCheckReleaseSeats: true,
  isCheckPayoneInquiry: false, // Enable if Payone payment gateway is added
  isSendPassEmail: false,
};

if (cronRun.isCreateInvSendTicketEmail) {
  const job = new CronJob(
    "*/10 * * * * *", // Every 10 seconds
    async () => {
      console.log("Running CreateInvSendTicketEmail cron every 10 seconds");
      const { CreateInvSendTicketEmail } = await import(
        "../cron/CreateInvSendTicketEmail.js"
      );
      await CreateInvSendTicketEmail();
    },
    null,
    true
  );
  job.start();
}

if (cronRun.isCheckReleaseSeats) {
  const job = new CronJob(
    "* * * * *", // Every minute
    async () => {
      console.log("Running CheckReleaseSeats cron every 1 minute");
      const { CheckReleaseSeats } = await import(
        "../cron/CheckReleaseSeats.js"
      );
      await CheckReleaseSeats();
    },
    null,
    true
  );
  job.start();
}

// Enable if Payone payment gateway is added
if (cronRun.isCheckPayoneInquiry) {
  const job = new CronJob(
    "* * * * *", // Every minute
    async () => {
      console.log("Running CheckPayoneInquiry cron every 1 minute");
      const { CheckPayoneInquiry } = await import(
        "../cron/CheckPayoneInquiry.js"
      );
      await CheckPayoneInquiry();
    },
    null,
    true
  );
  job.start();
}

if (cronRun.isSendPassEmail) {
  const job = new CronJob(
    "* * * * *", // Every minute
    async () => {
      console.log("Running SendPassEmail cron every 1 minute");
      const { SendPassEmail } = await import("../cron/SendPassEmail.js");
      await SendPassEmail();
    },
    null,
    true
  );
  job.start();
}
