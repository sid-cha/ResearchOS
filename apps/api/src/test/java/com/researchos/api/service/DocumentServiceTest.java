package com.researchos.api.service;

import com.researchos.api.dto.MlDto;
import com.researchos.api.entity.Document;
import com.researchos.api.repository.DocChunkRepository;
import com.researchos.api.repository.DocumentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.RestTemplate;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DocumentServiceTest {
    @Test void defaultMlOriginUsesSeparatePortFromTradeScope() {
        verifyOrigin(null, "http://127.0.0.1:8001/process_document");
    }

    @Test void configuredMlOriginIsUsedAndTrailingSlashDoesNotDuplicatePath() {
        verifyOrigin("http://127.0.0.1:8123/", "http://127.0.0.1:8123/process_document");
    }

    private void verifyOrigin(String override, String expectedUrl) {
        DocumentRepository documents=mock(DocumentRepository.class);
        DocChunkRepository chunks=mock(DocChunkRepository.class);
        RestTemplateBuilder builder=mock(RestTemplateBuilder.class);
        RestTemplate client=mock(RestTemplate.class);
        when(builder.build()).thenReturn(client);
        when(documents.save(any(Document.class))).thenAnswer(call->call.getArgument(0));
        MlDto.ProcessDocResponse response=new MlDto.ProcessDocResponse();
        response.setChunks(List.of());
        when(client.postForObject(eq(expectedUrl),any(MlDto.ProcessDocRequest.class),eq(MlDto.ProcessDocResponse.class))).thenReturn(response);
        ApplicationContextRunner runner=new ApplicationContextRunner()
                .withBean(DocumentRepository.class,()->documents)
                .withBean(DocChunkRepository.class,()->chunks)
                .withBean(RestTemplateBuilder.class,()->builder)
                .withBean(DocumentService.class);
        if(override!=null)runner=runner.withPropertyValues("researchos.ml.origin="+override);
        runner.run(context->{
            assertThat(context).hasNotFailed();
            MockMultipartFile file=new MockMultipartFile("file","fixture.txt","text/plain","Fixture document".getBytes(StandardCharsets.UTF_8));
            Document saved=context.getBean(DocumentService.class).processDocument(file,"MSFT","10-K");
            assertThat(saved.getProcessed()).isTrue();
            verify(client).postForObject(eq(expectedUrl),any(MlDto.ProcessDocRequest.class),eq(MlDto.ProcessDocResponse.class));
        });
    }
}
