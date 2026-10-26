import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FRAMEWORKS } from '@designloop/shared';
import type { Framework } from '@designloop/shared';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { RunsService } from './runs.service';

@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('design', { limits: { fileSize: 5 * 1024 * 1024 } }))
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('hint') hint: string | undefined,
    @Body('framework') framework: string | undefined,
    @Req() req: Request
  ) {
    if (!file) throw new BadRequestException('Attach a PNG or JPEG design in the "design" field.');
    const chosen: Framework | undefined = FRAMEWORKS.find((option) => option === framework);
    if (framework !== undefined && !chosen) {
      throw new BadRequestException(`The framework must be one of: ${FRAMEWORKS.join(', ')}.`);
    }
    return this.runs.create(file.buffer, (hint ?? '').trim().slice(0, 500), chosen ?? 'react', req.ip ?? 'unknown');
  }

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('framework') framework?: string,
    @Query('status') status?: string,
    @Query('review') review?: string
  ) {
    return this.runs.list({
      limit: limit === undefined ? undefined : Number(limit),
      cursor,
      framework,
      status,
      review
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }

  @Post(':id/revisions')
  revise(@Param('id') id: string, @Body('instruction') instruction: string | undefined, @Req() req: Request) {
    return this.runs.revise(id, (instruction ?? '').trim().slice(0, 500), req.ip ?? 'unknown');
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Body('decision') decision: string | undefined) {
    if (decision !== 'accepted' && decision !== 'rejected' && decision !== 'none') {
      throw new BadRequestException('The decision must be "accepted", "rejected" or "none".');
    }
    return this.runs.review(id, decision);
  }

  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.runs.stream(id).pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  @Get(':id/files/:name')
  file(@Param('id') id: string, @Param('name') name: string, @Res() res: Response) {
    const path = this.runs.filePath(id, name);
    if (!path) throw new NotFoundException();
    res.setHeader('Cache-Control', 'no-store');
    res.type('image/png');
    res.sendFile(path);
  }
}
