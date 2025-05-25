import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.string("event_prefix_code").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("event_prefix_code");
  });
}

export { down, up };
