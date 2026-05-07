-- Zone 268: Vice Island II
INSERT INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags) VALUES (268, 'Vice Island II', 'Questor', 26800, 26899, 30, 1, 0);
INSERT INTO zone_commands (zone_id, sort_order, command, if_flag, arg1, arg2, arg3, arg4, sarg1, sarg2, comment) VALUES (268, 0, 'M', 0, 26716, 1, 26804, NULL, NULL, NULL, '(the Grand Dragon of Terror)');
INSERT INTO zone_commands (zone_id, sort_order, command, if_flag, arg1, arg2, arg3, arg4, sarg1, sarg2, comment) VALUES (268, 1, 'G', 1, 26734, 99, -1, NULL, NULL, NULL, '(a red-hot key)');
INSERT INTO rooms (vnum, zone_id, name, description, flags, sector_type) VALUES (26800, 268, 'Blindingly lit hallway', 'A bright hallway.', 8, 0);
INSERT INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room) VALUES (26800, 'NORTH', 'You see a door.', '["door","secret"]', 0, 0, 26804);
INSERT INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room) VALUES (26800, 'EAST', '', '[]', 0, 0, 26802);
INSERT OR IGNORE INTO room_extra_descriptions (room_vnum, keyword, description) VALUES (26800, 'credits', 'Built by Questor.');
INSERT INTO rooms (vnum, zone_id, name, description, flags, sector_type) VALUES (26801, 268, 'Deadly Iron Maiden', 'A trap room.', 516, 0);
INSERT OR IGNORE INTO room_triggers (room_vnum, trigger_vnum) VALUES (26801, 26800);
INSERT INTO rooms (vnum, zone_id, name, description, flags, sector_type) VALUES (26804, 268, 'Grand Temple of Terror', 'A shrine to terror.', 8, 0);
INSERT INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room) VALUES (26804, 'EAST', 'You see nothing worth mentioning...', '["door","secret"]', 1, -1, 26797);
INSERT OR IGNORE INTO room_extra_descriptions (room_vnum, keyword, description) VALUES (26804, 'drawings', 'Don''t look at them!');
