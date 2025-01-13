import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.text("seat_names").after("currency").defaultTo(null);
    table.text("total_price").after("seat_names").defaultTo(null);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("seat_names");
    table.dropColumn("total_price");
  });
}

export { down, up };
