import 'knex';

async function up(Knex) {
  await Knex.schema.createTable("pass_event_movie_discount", (table) => {
    table.increments("discount_id").primary();
    table.enu("pass_type", ["all", "movie", "event"]).defaultTo(null);
    table.enu("discount_for", ["all", "movie", "event"]).defaultTo(null);
    table.string("discount_percent");
    table.string("discount_is_active");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(Knex.fn.now());
    table.datetime("updated_at").defaultTo(Knex.fn.now());
  });
}
async function down(Knex) {
  await Knex.schema.dropTable("pass_event_movie_discount");
}

export { down, up };
