async function up(knex) {
  await knex.schema.createTable("ms_banner", (table) => {
    table.increments("b_id").primary();
    table.integer("event_id");
    table.integer("order");
  });

  await knex.schema.createTable("ms_seat_layout", (table) => {
    table.increments("sl_id").primary();
    table.string("seat_layout_name");
    table.text("seat_layout_data");
    table.integer("seat_count");
  });

  await knex.schema.alterTable("ms_event", (table) => {
    table.integer("sl_id").after("event_cinema_id");
  });

  await knex.raw(
    `ALTER TABLE ms_seat_layout CHANGE seat_layout_data seat_layout_data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}

async function down(knex) {
  await knex.schema.dropTable("ms_banner");
  await knex.schema.dropTable("ms_seat_layout");
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("sl_id");
  });
}

export { down, up };
