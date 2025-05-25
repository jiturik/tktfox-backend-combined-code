import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_scanned_tickets", (table) => {
    table.integer("event_id").defaultTo(0);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_scanned_tickets", (table) => {
    table.dropColumn("event_id");
  });
}

export { down, up };
