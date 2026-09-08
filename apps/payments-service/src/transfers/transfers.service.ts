import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {

	create(_dto: CreateTransferDto): never {
		throw new NotImplementedException('Сага переказу ще не реалізована');
	}

	// TODO: віддавати реальний статус саги переказу.
	getStatus(_id: string): never {
		throw new NotImplementedException('Статус переказу ще не реалізовано');
	}
}
