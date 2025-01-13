import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.integer("total_seats").defaultTo(0);
    table.integer("seats_scanned").defaultTo(0);
    table.integer("seats_tobe_scanned").defaultTo(0);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("total_seats");
    table.dropColumn("seats_scanned");
    table.dropColumn("seats_tobe_scanned");
  });
}

export { down, up };
