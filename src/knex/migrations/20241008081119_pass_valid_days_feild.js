import 'knex';

async function up(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.integer("pass_valid_days").defaultTo(0);
  });
}
async function down(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.dropColumn("pass_valid_days");
  });
}

export { down, up };
