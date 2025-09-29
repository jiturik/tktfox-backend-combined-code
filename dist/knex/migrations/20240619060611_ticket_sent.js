async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.enu("ticket_sent", ["Y", "N"]).defaultTo("N");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("ticket_sent");
  });
}

export { down, up };
