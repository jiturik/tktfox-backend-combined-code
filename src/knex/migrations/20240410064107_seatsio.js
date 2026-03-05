export async function up(knex) {
  await knex.raw(
    `ALTER TABLE ms_event 
    CHANGE event_seating_type event_seating_type enum('Y','N','seats_io') DEFAULT 'Y';
    `
  );
  await knex.schema.alterTable("ms_event", (table) => {
    table.string("seatsio_eventkey").nullable();
  });

  await knex.schema.alterTable("ms_reservation", (table) => {
    table.string("seatsio_holdtoken").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("seatsio_eventkey");
  });
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("seatsio_holdtoken");
  });
}
