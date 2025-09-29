async function up(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.string("seatsio_eventkey").nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("seatsio_eventkey");
  });
}

export { down, up };
