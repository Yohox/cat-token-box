import { Module } from '@nestjs/common';
import { MinterService } from './minter.service';
import { MinterController } from './minter.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TxOutEntity } from '../../entities/txOut.entity';
import { TokenModule } from '../token/token.module';
import { BlockModule } from '../../services/block/block.module';
import { RpcModule } from 'src/services/rpc/rpc.module';

@Module({
  imports: [TokenModule, BlockModule, TypeOrmModule.forFeature([TxOutEntity]), RpcModule],
  providers: [MinterService],
  controllers: [MinterController],
})
export class MinterModule {}
