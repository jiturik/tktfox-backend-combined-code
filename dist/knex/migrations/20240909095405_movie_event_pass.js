async function up(knex) {
  await knex.schema.createTable("movie_event_pass", (table) => {
    table.increments("pass_id").primary();
    table.string("pass_name");
    table.enu("pass_type", ["all", "movie", "event"]).defaultTo(null);
    table.integer("total_available_pass").defaultTo(1);
    table.datetime("pass_validity_from").nullable();
    table.datetime("pass_validity_to").nullable();
    table.enu("discount_type", ["percent"]).defaultTo("percent");
    table.float("pass_discount_value").defaultTo(0);
    table.text("pass_tnc");
    table.integer("max_seats_per_trans").defaultTo(1);
    table.integer("max_transaction_per_day").defaultTo(1);
    table.integer("max_transaction_per_user").defaultTo(1);
    table.enu("pass_target", ["country", "city", "cinema"]).defaultTo(null);
    table.enu("is_validate_genre", ["Y", "N"]).defaultTo("N");
    table.enu("is_validate_lang", ["Y", "N"]).defaultTo("N");
    table.enu("pass_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("org_id").nullable();
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("movie_event_pass_mapper", (table) => {
    table.increments("pass_map_id").primary();
    table.string("pass_id");
    table.enu("pass_target", ["country", "city", "cinema"]).defaultTo(null);
    table.integer("country_id").nullable();
    table.integer("city_id").nullable();
    table.integer("cinema_id").nullable();
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("movie_event_pass");
  await knex.schema.dropTable("movie_event_pass_mapper");
}

export { down, up };
