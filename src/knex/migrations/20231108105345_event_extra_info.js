export async function up(knex) {
  await knex.schema.createTable("ms_event_extra_info", (table) => {
    table.increments("extra_info_id").primary();
    table.integer("event_id");
    table.string("extra_info_name");
    table.text("extra_info_description");
    table.text("extra_info_img");
    table
      .enu("extra_info_type", ["speaker", "sponser", "organiser", "not_added"])
      .defaultTo("not_added");
    table.enu("extra_info_is_active", ["Y", "N"]).defaultTo("Y");
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_event_extra_info");
}
