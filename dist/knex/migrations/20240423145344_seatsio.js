async function up(knex) {
  await knex.raw(
    `ALTER TABLE ms_reservation 
    CHANGE is_seat_layout_exist is_seat_layout_exist enum('Y','N','seats_io') DEFAULT 'Y';
    `
  );
}

async function down(knex) {}

export { down, up };
