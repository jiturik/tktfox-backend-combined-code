import 'knex';

async function up(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.float("pass_amount").defaultTo(0).after("pass_validity_to");
    table.integer("pass_currency_id").nullable().after("pass_amount");
  });
}
async function down(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.dropColumn("pass_amount");
    table.dropColumn("pass_currency_id");
  });
}

export { down, up };
