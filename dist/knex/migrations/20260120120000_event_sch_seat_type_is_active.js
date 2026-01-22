async function up(knex) {
  await knex.schema.alterTable("event_sch_seat_type", (table) => {
    table.enu("is_active", ["Y", "N"]).defaultTo("Y");
  });
}

async function down(knex) {
  await knex.schema.alterTable("event_sch_seat_type", (table) => {
    table.dropColumn("is_active");
  });
}

export { down, up };
