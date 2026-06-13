import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  // We export UsersService so AuthModule can use it
  exports: [UsersService],
})
export class UsersModule {}