import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.enu("sl_is_active", ["Y", "N"]).defaultTo("Y");
    table.enu("sl_type", ["open", "close"]).defaultTo("open");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.dropColumn("sl_is_active");
    table.dropColumn("sl_type");
  });
}

export { down, up };
