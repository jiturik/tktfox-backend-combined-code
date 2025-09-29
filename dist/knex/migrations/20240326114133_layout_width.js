async function up(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.string("layout_width").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.dropColumn("layout_width");
  });
}

export { down, up };
