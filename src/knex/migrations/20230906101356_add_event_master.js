export async function up(knex) {
  await knex.schema.createTable("ms_event", (table) => {
    table.increments("event_id").primary();
    table.integer("event_cinema_id");
    table.string("event_name");
    table.date("event_start_date").defaultTo(null);
    table.date("event_end_date").defaultTo(null);
    table.string("event_age_limit");
    table.string("event_image_small");
    table.string("event_image_medium");
    table.string("event_image_large");
    table.text("event_short_description");
    table.text("event_long_description");
    table.text("event_tnc");
    table.enu("event_seating_type", ["Y", "N"]).defaultTo("Y");
    table.enu("event_booking_active", ["Y", "N"]).defaultTo("Y");
    table.enu("event_is_private", ["Y", "N"]).defaultTo("N");
    table.enu("event_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("event_schedule", (table) => {
    table.increments("event_sch_id").primary();
    table.integer("event_id");
    table.date("sch_date").defaultTo(null);
    table.time("sch_time").defaultTo(null);
    table.string("sch_max_capacity");
    table.enu("sch_is_active", ["Y", "N"]).defaultTo("Y");
  });

  await knex.schema.createTable("event_sch_seat_type", (table) => {
    table.increments("event_sch_ss_id").primary();
    table.integer("event_sch_id");
    table.integer("event_id");
    table.integer("sct_id");
    table.string("available_seats");
    table.string("price_per_seat");
  });

  await knex.schema.createTable("event_genre", (table) => {
    table.increments("evt_g_id").primary();
    table.integer("genre_id");
    table.integer("event_id");
  });

  await knex.schema.createTable("event_language", (table) => {
    table.increments("evt_l_id").primary();
    table.integer("lang_id");
    table.integer("event_id");
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_event");
  await knex.schema.dropTable("event_schedule");
  await knex.schema.dropTable("event_sch_seat_type");
  await knex.schema.dropTable("event_genre");
  await knex.schema.dropTable("event_language");
}
