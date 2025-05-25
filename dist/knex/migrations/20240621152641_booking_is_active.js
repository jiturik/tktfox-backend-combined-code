import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.enu("booking_is_active", ["Y", "N"]).defaultTo("Y");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("booking_is_active");
  });
}

export { down, up };
