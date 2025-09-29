async function up(knex) {
  await knex.schema.alterTable("event_schedule", (table) => {
    table.string("seatsio_eventkey").nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable("event_schedule", (table) => {
    table.dropColumn("seatsio_eventkey");
  });
}

export { down, up };
